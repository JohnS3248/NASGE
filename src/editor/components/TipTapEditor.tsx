import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { createEditorExtensions, EMPTY_DOC } from "../utils/editorExtensions";
import { extractFilesFromPaste, extractFilesFromDrop } from "../utils/imageInput";
import { processIncomingImages } from "../services/imageIntake";
import { uploadSingleImage } from "../services/ImageUploadService";
import { useImageStore } from "../stores/useImageStore";
import { useEditorImageNodeStore } from "../stores/useEditorImageNodeStore";
import { useImagePanelStore } from "../stores/useImagePanelStore";
import { useSteamGuideImageStore } from "../stores/useSteamGuideImageStore";
import {
  useEditorConfigStore,
  SELECTION_MENU_ITEMS,
  EMPTY_MENU_ITEMS,
  IMAGE_MENU_PRESET_ITEMS,
  IMAGE_MENU_ALIGN_ITEMS,
  IMAGE_MENU_ACTION_ITEMS
} from "../stores/useEditorConfigStore";
import { useGuideStore } from "../stores/useGuideStore";
import type { ImageSizePreset, ImageAlignment } from "../types/image";
import { checkCharacterLimit, getCharacterCountColor, getCharacterCountText } from "../utils/characterLimit";
import { CONTENT_CHARACTER_LIMIT } from "../constants/limits";
import { loggers } from "../../shared/logger";
import { NASGE_IMAGE_MIME_TYPE, type ImageDragData } from "./ImageFloatingPanel";
import TableControls from "./TableControls";

// 类型别名，保持向后兼容
type ImageDisplayPreset = ImageSizePreset;

const toolbarButton: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#d7e8ff",
  padding: "0.35rem 0.75rem",
  borderRadius: "0.6rem",
  fontSize: "0.85rem",
  cursor: "pointer",
  fontWeight: 600
};

type TipTapEditorProps = {
  initialContent?: string;
  externalDoc?: JSONContent;
  onUpdate?: (payload: { html: string; json: JSONContent }) => void;
};

type ImageContextPayload = {
  imageNodeId: string;
  pos: number | null; // 图片节点在文档中的位置
  sizePreset: ImageDisplayPreset; // 被点击图片的尺寸预设
  alignment: ImageAlignment; // 被点击图片的对齐方式
};

type ContextMenuMode = "selection" | "empty" | "image";

type ContextMenuState = {
  visible: boolean;
  x: number;
  y: number;
  mode: ContextMenuMode;
  payload?: ImageContextPayload;
};

const INITIAL_CONTEXT_MENU: ContextMenuState = {
  visible: false,
  x: 0,
  y: 0,
  mode: "empty"
};

const IMAGE_SIZE_OPTIONS: Array<{ label: string; value: ImageDisplayPreset }> = [
  { label: "原尺寸", value: "original" },
  { label: "半宽", value: "half" },
  { label: "全宽", value: "full" }
];

const IMAGE_ALIGNMENT_OPTIONS: Array<{ label: string; value: ImageAlignment }> = [
  { label: "左对齐", value: "floatLeft" },
  { label: "右对齐", value: "floatRight" },
  { label: "内嵌", value: "inline" }
];

const TipTapEditor: React.FC<TipTapEditorProps> = ({
  initialContent = "<p>欢迎使用 NASGE。这里是 Sprint 1 的 Tiptap 最小可行版本。</p>",
  externalDoc,
  onUpdate
}) => {
  const extensions = useMemo(() => createEditorExtensions(), []);
  const ignoreNextUpdateRef = useRef(false);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(INITIAL_CONTEXT_MENU);
  // 字符数限制信息
  const [characterInfo, setCharacterInfo] = useState(() => ({
    length: 0,
    remaining: CONTENT_CHARACTER_LIMIT,
    exceeded: false,
    warning: false,
    limit: CONTENT_CHARACTER_LIMIT
  }));
  // 选择变化计数器 - 用于强制工具栏重新渲染
  const [selectionKey, setSelectionKey] = useState(0);

  // === 右键菜单配置 ===
  const imageMenuConfig = useEditorConfigStore(state => state.imageMenuConfig);
  const selectionMenuConfig = useEditorConfigStore(state => state.selectionMenuConfig);
  const emptyMenuConfig = useEditorConfigStore(state => state.emptyMenuConfig);

  const editor = useEditor({
    extensions,
    content: externalDoc ?? EMPTY_DOC,
    editorProps: {
      attributes: {
        class:
          "nasge-editor prose prose-invert focus:outline-none text-[15px] leading-relaxed"
      }
    },
    onUpdate: ({ editor }) => {
      if (ignoreNextUpdateRef.current) {
        ignoreNextUpdateRef.current = false;
        return;
      }
      onUpdate?.({
        html: editor.getHTML(),
        json: editor.getJSON()
      });
      // 更新字符数信息
      setCharacterInfo(checkCharacterLimit(editor, CONTENT_CHARACTER_LIMIT));
    },
    onSelectionUpdate: () => {
      // 选择变化时触发重新渲染，确保工具栏状态正确更新
      setSelectionKey(k => k + 1);
    }
  });

  // === 图片节点状态 (新 Store 优先，旧 Store 兜底) ===
  const contextMenuImageEntity = useImageStore(
    useCallback(
      (state) => {
        if (contextMenu.mode !== "image" || !contextMenu.payload?.imageNodeId) {
          return undefined;
        }
        const nodeId = contextMenu.payload.imageNodeId;
        // 1. 先通过 sourceNodeId 查找（本地上传的图片）
        const bySourceNodeId = state.getImageBySourceNodeId(nodeId);
        if (bySourceNodeId) return bySourceNodeId;
        // 2. 再通过 steamPreviewId 查找（BBCode 导入的图片，nodeId 可能是 previewId）
        return state.getImageBySteamPreviewId(nodeId);
      },
      [contextMenu]
    )
  );

  // 旧 Store 兜底（迁移期间）
  const contextMenuImageNodeLegacy = useEditorImageNodeStore(
    useCallback(
      (state) =>
        contextMenu.mode === "image" && contextMenu.payload?.imageNodeId
          ? state.nodes[contextMenu.payload.imageNodeId]
          : undefined,
      [contextMenu]
    )
  );

  // 合并的图片节点数据（用于 UI 显示）
  const contextMenuImageNode = useMemo(() => {
    if (contextMenuImageEntity) {
      // 新 Store 有数据，转换为旧格式以兼容 UI
      return {
        nodeId: contextMenuImageEntity.sourceNodeId ?? contextMenuImageEntity.id,
        display: {
          preset: contextMenuImageEntity.display.preset,
          alignment: contextMenuImageEntity.display.alignment,
          customWidthPx: contextMenuImageEntity.display.customWidthPx
        }
      };
    }
    // 回退到旧 Store
    return contextMenuImageNodeLegacy;
  }, [contextMenuImageEntity, contextMenuImageNodeLegacy]);

  // 新 Store 更新方法
  const updateImageDisplayNew = useImageStore((state) => state.updateDisplay);
  // 旧 Store 更新方法（双写）
  const updateImageDisplayLegacy = useEditorImageNodeStore((state) => state.updateDisplay);
  const removeImageNodeLegacy = useEditorImageNodeStore((state) => state.removeNode);
  const removeImageNew = useImageStore((state) => state.removeImage);

  // 合并的更新方法（保留用于其他场景）
  const updateImageDisplay = useCallback(
    (nodeId: string, patch: Partial<{ preset: ImageDisplayPreset; alignment: ImageAlignment; customWidthPx?: number }>) => {
      // 先尝试用 sourceNodeId 查找，再尝试用 steamPreviewId 查找
      let imageEntity = useImageStore.getState().getImageBySourceNodeId(nodeId);
      if (!imageEntity) {
        // BBCode 导入的图片可能只有 previewId，没有 sourceNodeId
        imageEntity = useImageStore.getState().getImageBySteamPreviewId(nodeId);
      }
      if (imageEntity) {
        updateImageDisplayNew(imageEntity.id, patch);
      }
      // 同时更新旧 Store（双写）
      updateImageDisplayLegacy(nodeId, patch);
    },
    [updateImageDisplayNew, updateImageDisplayLegacy]
  );

  // 合并的删除方法
  const removeImageNode = useCallback(
    (nodeId: string) => {
      // 先尝试删除新 Store
      const imageEntity = useImageStore.getState().getImageBySourceNodeId(nodeId);
      if (imageEntity) {
        removeImageNew(imageEntity.id);
      }
      // 同时删除旧 Store（双写）
      removeImageNodeLegacy(nodeId);
    },
    [removeImageNew, removeImageNodeLegacy]
  );

  const toggleLink = useCallback(() => {
    if (!editor) return;

    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const selectionText = editor.state.doc.textBetween(
      editor.state.selection.from,
      editor.state.selection.to
    );

    const url = window.prompt("请输入链接地址", previousUrl ?? "https://");
    if (url === null || url.trim() === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }

    let label = selectionText;
    if (!label) {
      label = window.prompt("显示文本（留空则使用链接本身）", url) ?? url;
      editor
        .chain()
        .focus()
        .insertContent(label)
        .setTextSelection({
          from: editor.state.selection.from - label.length,
          to: editor.state.selection.from
        })
        .run();
    }

    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url })
      .run();
  }, [editor]);

  const toggleSpoiler = useCallback(() => {
    editor?.chain().focus().toggleSpoiler().run();
  }, [editor]);

  const insertHorizontalRule = useCallback(() => {
    editor?.chain().focus().setHorizontalRule().run();
  }, [editor]);

  const insertTable = useCallback(() => {
    if (!editor) return;
    // 默认插入 2×2 表格，用户可通过拓展条添加更多行列
    editor
      .chain()
      .focus()
      .insertTable({ rows: 2, cols: 2, withHeaderRow: true })
      .run();
  }, [editor]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(INITIAL_CONTEXT_MENU);
  }, []);

  // 查找图片节点的辅助函数
  // data-image-node-id 可能是 imageNodeId 或 previewId，需要都检查
  const findImageNodeByDataId = useCallback((targetId: string): number | null => {
    if (!editor) return null;
    let foundPos: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "steamImage") {
        console.log('[DEBUG] steamImage node attrs:', node.attrs, 'targetId:', targetId);
        // 检查 imageNodeId 或 previewId 是否匹配
        if (node.attrs.imageNodeId === targetId || node.attrs.previewId === targetId) {
          foundPos = pos;
          return false; // 停止遍历
        }
      }
      return true;
    });
    return foundPos;
  }, [editor]);

  const applyImagePreset = useCallback(
    (preset: ImageDisplayPreset) => {
      if (!editor || contextMenu.mode !== "image" || !contextMenu.payload?.imageNodeId) {
        return;
      }
      // 优先使用存储的位置（精确定位被点击的图片）
      // 回退到按 ID 搜索（兼容旧逻辑）
      const pos = contextMenu.payload.pos ?? findImageNodeByDataId(contextMenu.payload.imageNodeId);
      const nodeId = contextMenu.payload.imageNodeId;
      if (pos !== null) {
        // 1. 更新 TipTap 节点属性
        editor.chain().focus().setNodeSelection(pos).updateAttributes("steamImage", {
          sizePreset: preset
        }).run();
        // 2. 同步更新 Store（双写）
        updateImageDisplay(nodeId, { preset });
      }
    },
    [contextMenu, editor, findImageNodeByDataId, updateImageDisplay]
  );

  const applyImageAlignment = useCallback(
    (alignment: ImageAlignment) => {
      if (!editor || contextMenu.mode !== "image" || !contextMenu.payload?.imageNodeId) {
        return;
      }
      // 优先使用存储的位置（精确定位被点击的图片）
      // 回退到按 ID 搜索（兼容旧逻辑）
      const pos = contextMenu.payload.pos ?? findImageNodeByDataId(contextMenu.payload.imageNodeId);
      const nodeId = contextMenu.payload.imageNodeId;
      if (pos !== null) {
        // 1. 更新 TipTap 节点属性
        editor.chain().focus().setNodeSelection(pos).updateAttributes("steamImage", {
          alignment
        }).run();
        // 2. 同步更新 Store（双写）
        updateImageDisplay(nodeId, { alignment });
      }
    },
    [contextMenu, editor, findImageNodeByDataId, updateImageDisplay]
  );

  const handleDeleteImage = useCallback(() => {
    if (!editor || contextMenu.mode !== "image" || !contextMenu.payload?.imageNodeId) {
      return;
    }

    const nodeId = contextMenu.payload.imageNodeId;
    editor.commands.focus();
    editor.chain().focus().deleteSelection().run();
    removeImageNode(nodeId);
  }, [contextMenu, editor, removeImageNode]);

  const handleUploadImage = useCallback(async () => {
    if (!editor || contextMenu.mode !== "image" || !contextMenu.payload?.imageNodeId) {
      return;
    }

    const nodeId = contextMenu.payload.imageNodeId;

    try {
      loggers.image.info('TipTapEditor 开始上传图片:', nodeId);
      const previewId = await uploadSingleImage(nodeId);
      loggers.image.info('TipTapEditor 图片上传成功，预览码:', previewId);

      // 可选：显示成功提示
      // window.alert(`图片上传成功！预览码：${previewId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      loggers.image.error('TipTapEditor 图片上传失败:', errorMessage);
      window.alert(`图片上传失败：${errorMessage}`);
    }
  }, [contextMenu, editor]);

  const insertImage = useCallback(() => {
    if (!editor) return;
    const src = window.prompt("输入图片链接", "https://")?.trim();
    if (!src) return;
    const alt = window.prompt("图片描述（可选）", "") ?? "";
    editor.chain().focus().setImage({ src, alt }).run();
  }, [editor]);

  const insertQuote = useCallback(() => {
    if (!editor) return;
    const author = window.prompt("引用来源（可选）", "") ?? "";
    editor
      .chain()
      .focus()
      .insertContent({
        type: "blockquote",
        attrs: { author },
        content: [
          ...(author
            ? [{
                type: "paragraph",
                content: [{ type: "text", text: `引用自 ${author}：` }]
              }]
            : []),
          { type: "paragraph", content: [] }
        ]
      })
      .run();
  }, [editor]);

  const insertCodeBlock = useCallback(() => {
    editor?.chain().focus().toggleCodeBlock().run();
  }, [editor]);

  const clearFormatting = useCallback(() => {
    editor
      ?.chain()
      .focus()
      .unsetAllMarks()
      .clearNodes()
      .setParagraph()
      .run();
  }, [editor]);

  useEffect(() => {
    const listener = () => closeContextMenu();
    window.addEventListener("click", listener);
    return () => window.removeEventListener("click", listener);
  }, [closeContextMenu]);

  useEffect(() => {
    return () => editor?.destroy();
  }, [editor]);

  const handleIncomingFiles = useCallback(
    async (files: File[], source: "paste" | "drop") => {
      if (!editor || !files.length) return;
      const cursorPosition = editor.state.selection.anchor;

      try {
        await processIncomingImages(editor, files, {
          source,
          cursorPosition
        });
      } catch (error) {
        loggers.image.error("TipTapEditor 处理图片失败:", error);
      }
    },
    [editor]
  );

  // 获取悬浮窗插入设置
  const { defaultInsertSize, defaultInsertAlignment, afterInsertAction, close: closeImagePanel, minimize: minimizeImagePanel } = useImagePanelStore();

  // 处理从图片悬浮窗拖入的图片
  const handleNasgeImageDrop = useCallback(
    (dragData: ImageDragData, dropPosition?: number) => {
      if (!editor) return;

      loggers.image.info("从悬浮窗拖入图片", {
        imageCount: dragData.images.length,
        dropPosition
      });

      // 设置光标位置
      if (dropPosition !== undefined) {
        editor.chain().focus().setTextSelection(dropPosition).run();
      } else {
        editor.commands.focus();
      }

      // 映射尺寸设置到编辑器的 preset
      const sizePresetMap: Record<string, ImageSizePreset> = {
        original: "original",
        medium: "half",
        small: "thumb"
      };
      const sizePreset = sizePresetMap[defaultInsertSize] || "original";

      // 映射对齐设置
      const alignmentMap: Record<string, ImageAlignment> = {
        floatLeft: "floatLeft",
        floatRight: "floatRight",
        center: "inline", // 暂无 center，使用 inline
        inline: "inline"
      };
      const alignment = alignmentMap[defaultInsertAlignment] || "inline";

      // 插入每张图片
      for (const image of dragData.images) {
        editor.commands.insertSteamImage({
          previewId: image.previewId || null,
          fileName: image.fileName,
          previewDataUrl: image.localUrl || image.thumbnailUrl || null,
          sizePreset,
          alignment
        });

        loggers.image.verbose("插入图片节点", {
          fileName: image.fileName,
          previewId: image.previewId,
          sizePreset,
          alignment
        });
      }

      // 执行插入后动作
      if (afterInsertAction === "close") {
        closeImagePanel();
      } else if (afterInsertAction === "minimize") {
        minimizeImagePanel();
      }
    },
    [editor, defaultInsertSize, defaultInsertAlignment, afterInsertAction, closeImagePanel, minimizeImagePanel]
  );

  useEffect(() => {
    if (!editor) return;

    const dom = editor.view.dom;

    const onPaste = (event: ClipboardEvent) => {
      const files = extractFilesFromPaste(event);
      if (!files.length) return;
      event.preventDefault();
      event.stopPropagation();

      // 新流程：粘贴图片到图片池，而不是直接插入编辑器
      const imagePoolStore = useSteamGuideImageStore.getState();
      const imagePanelStore = useImagePanelStore.getState();
      const configStore = useEditorConfigStore.getState();
      const currentArchiveId = useGuideStore.getState().currentArchiveId;

      loggers.image.info("粘贴图片到图片池", { fileCount: files.length, currentArchiveId });

      // 异步添加图片到图片池
      (async () => {
        const addedImages: string[] = [];
        for (const file of files) {
          // 传递当前存档 ID，确保图片在图片池中可见
          const result = await imagePoolStore.addLocalImage(file, currentArchiveId ?? undefined);
          if (!result.skipped) {
            addedImages.push(result.image.fileName);
          } else {
            loggers.image.info("图片已存在，跳过添加", {
              fileName: file.name,
              existingFileName: result.existingFileName
            });
          }
        }

        // 打开图片池面板
        if (addedImages.length > 0) {
          imagePanelStore.open();

          // 判断粘贴后行为
          const shouldRename = configStore.promptRenameOnPaste;
          const shouldAutoUpload = configStore.autoUploadInPanel;

          if (shouldRename) {
            // 如果开启了"粘贴时重命名"，设置新图片为编辑状态
            // 延迟设置编辑状态，确保图片已渲染
            setTimeout(() => {
              imagePanelStore.setEditingImageId(addedImages[addedImages.length - 1]);
            }, 100);

            // 如果同时开启了自动上传，将图片添加到"待改名后上传"列表
            if (shouldAutoUpload) {
              for (const imageFileName of addedImages) {
                imagePanelStore.addPendingUploadAfterRename(imageFileName);
              }
              loggers.image.info("图片将在改名后自动上传", { addedImages });
            }
          }
          // 注意：如果只开启了 autoUploadOnPaste 但没开启 promptRenameOnPaste，
          // 上传逻辑由 ImageFloatingPanel 处理（现有逻辑）

          loggers.image.info("已添加图片到图片池", { addedImages, shouldRename, shouldAutoUpload });
        }
      })();
    };

    const onDrop = (event: DragEvent) => {
      // 优先检查是否为 NASGE 图片拖放
      const nasgeData = event.dataTransfer?.getData(NASGE_IMAGE_MIME_TYPE);
      if (nasgeData) {
        event.preventDefault();
        event.stopPropagation();

        try {
          const dragData = JSON.parse(nasgeData) as ImageDragData;
          if (dragData.type === "steam-image" && dragData.images?.length > 0) {
            // 获取拖放位置
            const coords = editor.view.posAtCoords({
              left: event.clientX,
              top: event.clientY
            });

            handleNasgeImageDrop(dragData, coords?.pos);
            return;
          }
        } catch (e) {
          loggers.image.warn("解析 NASGE 拖放数据失败:", e);
        }
      }

      // 处理普通文件拖放
      const files = extractFilesFromDrop(event);
      if (!files.length) return;
      event.preventDefault();
      event.stopPropagation();

      const coords = editor.view.posAtCoords({
        left: event.clientX,
        top: event.clientY
      });

      if (coords?.pos != null) {
        editor.chain().focus().setTextSelection(coords.pos).run();
      } else {
        editor.commands.focus();
      }

      void handleIncomingFiles(files, "drop");
    };

    const onDragOver = (event: DragEvent) => {
      // 检查是否为 NASGE 图片拖放
      if (event.dataTransfer?.types.includes(NASGE_IMAGE_MIME_TYPE)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        return;
      }

      // 检查是否为文件拖放
      const files = extractFilesFromDrop(event);
      if (!files.length) return;
      event.preventDefault();
    };

    dom.addEventListener("paste", onPaste as EventListener);
    dom.addEventListener("drop", onDrop as EventListener);
    dom.addEventListener("dragover", onDragOver as EventListener);

    return () => {
      dom.removeEventListener("paste", onPaste as EventListener);
      dom.removeEventListener("drop", onDrop as EventListener);
      dom.removeEventListener("dragover", onDragOver as EventListener);
    };
  }, [editor, handleIncomingFiles, handleNasgeImageDrop]);

  useEffect(() => {
    if (!editor || externalDoc === undefined) return;
    ignoreNextUpdateRef.current = true;
    editor.commands.setContent(externalDoc ?? EMPTY_DOC, { emitUpdate: false });
    // 更新字符数信息
    setCharacterInfo(checkCharacterLimit(editor, CONTENT_CHARACTER_LIMIT));
  }, [editor, externalDoc]);

  if (!editor) return null;

  const headingButtons = useMemo(
    () =>
      [
        { label: "H1", level: 1 as const },
        { label: "H2", level: 2 as const },
        { label: "H3", level: 3 as const }
      ] as const,
    []
  );

  return (
    <>
      <style>
        {`
          /* 覆盖 prose 类对图片的影响，确保图片容器和图片本身能正确显示 */
          /* 注意：不要在容器上设置 max-width !important，否则会覆盖内联样式的尺寸设置 */

          .nasge-editor-container .nasge-image-node img {
            margin: 0 !important;
            max-width: 100% !important;
            height: auto !important;
            display: block !important;
          }

          /* 图片选中状态样式 */
          .nasge-editor-container .ProseMirror-selectednode .nasge-image-node,
          .nasge-editor-container .node-steamImage.ProseMirror-selectednode .nasge-image-node {
            outline: 2px solid rgba(102, 192, 244, 0.8);
            outline-offset: 2px;
          }
        `}
      </style>
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: "0.85rem",
          background: "rgba(9, 15, 25, 0.55)",
          border: "1px solid rgba(102, 192, 244, 0.25)",
          borderRadius: "1rem",
          padding: "1.25rem",
          boxShadow: "0 18px 30px rgba(7, 11, 19, 0.45)"
        }}
      >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.25rem",
          flexWrap: "wrap",
          background: "rgba(15, 26, 41, 0.82)",
          borderRadius: "0.75rem",
          padding: "0.4rem 0.5rem",
          border: "1px solid rgba(102, 192, 244, 0.18)"
        }}
      >
        <ToolbarIcon
          label="B"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarIcon
          label="𝑰"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarIcon
          label="U"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />
        <ToolbarIcon
          label={
            <span
              style={{
                position: "relative",
                paddingInline: "0.05rem",
                fontWeight: 600
              }}
            >
              S
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: "45%",
                  borderBottom: "2px solid currentColor",
                  transform: "rotate(-12deg)"
                }}
              />
            </span>
          }
          title="删除线"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />
        <ToolbarIcon
          label="🙈"
          title="隐藏文本"
          active={editor.isActive("spoiler")}
          onClick={toggleSpoiler}
        />
        <ToolbarIcon
          label="<>"
          active={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        />
        <ToolbarIcon label="—" onClick={insertHorizontalRule} />
        {headingButtons.map(({ label, level }) => (
          <ToolbarIcon
            key={label}
            label={label}
            active={editor.isActive("heading", { level })}
            onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
          />
        ))}
        <ToolbarIcon
          label="•"
          title="项目符号列表"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarIcon
          label="1."
          title="有序列表"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarIcon label="Tx" title="清除格式" onClick={clearFormatting} />
      </div>

      <div
        ref={editorContainerRef}
        style={{
          minHeight: "260px",
          background: "rgba(10, 18, 30, 0.78)",
          borderRadius: "0.9rem",
          padding: "1.1rem",
          border: "1px solid rgba(102, 192, 244, 0.18)",
          overflowY: "auto",
          position: "relative"
        }}
        className="nasge-editor-container"
        onContextMenu={(event) => {
          if (!editor) {
            return;
          }

          const target = event.target as HTMLElement;
          const imageElement = target?.closest<HTMLElement>("[data-image-node-id]");
          if (imageElement) {
            const imageNodeId = imageElement.dataset.imageNodeId;
            if (imageNodeId) {
              // 检查图片菜单总开关
              if (!imageMenuConfig.enabled) {
                return; // 使用浏览器原生菜单
              }
              event.preventDefault();
              const coords = editor.view.posAtCoords({
                left: event.clientX,
                top: event.clientY
              });

              // 用 coords.pos 找到被点击的 steamImage 节点
              let nodeSizePreset: ImageDisplayPreset = "original";
              let nodeAlignment: ImageAlignment = "inline";
              let targetPos: number | null = null;

              if (coords?.pos != null) {
                // 从点击位置向前搜索最近的 steamImage 节点
                const clickPos = coords.pos;
                editor.state.doc.descendants((node, pos) => {
                  if (node.type.name === "steamImage") {
                    // 检查点击位置是否在这个节点范围内
                    const nodeEnd = pos + node.nodeSize;
                    if (clickPos >= pos && clickPos <= nodeEnd) {
                      nodeSizePreset = (node.attrs.sizePreset as ImageDisplayPreset) || "original";
                      nodeAlignment = (node.attrs.alignment as ImageAlignment) || "inline";
                      targetPos = pos;
                      return false; // 找到后停止遍历
                    }
                  }
                  return true;
                });

                // 设置选择（用找到的位置或原始位置）
                editor
                  .chain()
                  .focus()
                  .setNodeSelection(targetPos ?? clickPos)
                  .run();
              } else {
                editor.commands.focus();
              }

              console.log('[DEBUG 右键菜单] 按位置找到:', { nodeSizePreset, nodeAlignment, imageNodeId, targetPos, clickPos: coords?.pos });

              setContextMenu({
                visible: true,
                x: event.clientX,
                y: event.clientY,
                mode: "image",
                payload: {
                  imageNodeId,
                  pos: targetPos ?? coords?.pos ?? null, // 优先使用找到的精确位置
                  sizePreset: nodeSizePreset,
                  alignment: nodeAlignment
                }
              });
              return;
            }
          }

          const mode: ContextMenuMode = editor.state.selection.empty ? "empty" : "selection";

          // 检查对应菜单的总开关
          const menuEnabled = mode === "selection" ? selectionMenuConfig.enabled : emptyMenuConfig.enabled;
          if (!menuEnabled) {
            return; // 使用浏览器原生菜单
          }

          event.preventDefault();
          setContextMenu({
            visible: true,
            x: event.clientX,
            y: event.clientY,
            mode
          });
        }}
      >
        <EditorContent editor={editor} />

        {/* 表格控制条 */}
        <TableControls editor={editor} containerRef={editorContainerRef} />

        {/* 字符数统计 - 固定在编辑器右下角 */}
        <div
          style={{
            position: "absolute",
            bottom: "0.75rem",
            right: "0.75rem",
            fontSize: "0.8rem",
            fontWeight: 500,
            color: getCharacterCountColor(characterInfo),
            background: "rgba(9, 15, 25, 0.85)",
            padding: "0.35rem 0.65rem",
            borderRadius: "0.5rem",
            border: `1px solid ${characterInfo.exceeded ? 'rgba(239, 68, 68, 0.3)' : 'rgba(102, 192, 244, 0.2)'}`,
            backdropFilter: "blur(4px)",
            pointerEvents: "none"
          }}
        >
          {getCharacterCountText(characterInfo)}
        </div>
      </div>

      {contextMenu.visible ? (
        <div
          style={{
            position: "fixed",
            top: contextMenu.y,
            left: contextMenu.x,
            background: "rgba(13, 21, 34, 0.95)",
            border: "1px solid rgba(102, 192, 244, 0.3)",
            borderRadius: "0.75rem",
            padding: "0.35rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem",
            minWidth: "160px",
            zIndex: 9999,
            boxShadow: "0 16px 38px rgba(6, 12, 20, 0.55)"
          }}
        >
          {contextMenu.mode === "image" ? (
            contextMenuImageNode ? (
              <>
                {/* 动态渲染图片菜单 - 分组 */}
                {imageMenuConfig.groups.map((group, groupIndex) => {
                  const enabledItems = group.items.filter(item => item.enabled);
                  if (enabledItems.length === 0) return null;

                  // 获取分组的定义和标签
                  const groupDefs = group.groupId === 'preset' ? IMAGE_MENU_PRESET_ITEMS
                    : group.groupId === 'align' ? IMAGE_MENU_ALIGN_ITEMS
                    : IMAGE_MENU_ACTION_ITEMS;
                  const groupLabel = group.groupId === 'preset' ? '尺寸'
                    : group.groupId === 'align' ? '对齐'
                    : null; // action 组无标签

                  return (
                    <React.Fragment key={group.groupId}>
                      {groupIndex > 0 && <MenuDivider />}
                      {groupLabel && <MenuSectionLabel label={groupLabel} />}
                      {enabledItems.map(item => {
                        const def = groupDefs.find(d => d.id === item.id);
                        if (!def) return null;

                        // 根据 id 确定 onClick 和 active 状态
                        // 使用 payload 中的值（从被点击的 TipTap 节点读取），而非 Store 数据
                        if (group.groupId === 'preset') {
                          const preset = item.id.replace('preset-', '') as ImageSizePreset;
                          return (
                            <MenuItem
                              key={item.id}
                              label={def.label}
                              active={contextMenu.payload?.sizePreset === preset}
                              onClick={() => applyImagePreset(preset)}
                              onComplete={closeContextMenu}
                            />
                          );
                        } else if (group.groupId === 'align') {
                          const alignment = item.id.replace('align-', '') as ImageAlignment;
                          return (
                            <MenuItem
                              key={item.id}
                              label={def.label}
                              active={contextMenu.payload?.alignment === alignment}
                              onClick={() => applyImageAlignment(alignment)}
                              onComplete={closeContextMenu}
                            />
                          );
                        } else {
                          // action 组
                          const actionMap: Record<string, { onClick: () => void; danger?: boolean }> = {
                            upload: { onClick: handleUploadImage },
                            delete: { onClick: handleDeleteImage, danger: true }
                          };
                          const action = actionMap[item.id];
                          if (!action) return null;
                          return (
                            <MenuItem
                              key={item.id}
                              label={def.label}
                              onClick={action.onClick}
                              onComplete={closeContextMenu}
                              danger={action.danger}
                            />
                          );
                        }
                      })}
                    </React.Fragment>
                  );
                })}
              </>
            ) : (
              <div
                style={{
                  padding: "0.6rem 0.75rem",
                  color: "rgba(205, 226, 255, 0.75)",
                  fontSize: "0.8rem"
                }}
              >
                图片数据暂不可用。
              </div>
            )
          ) : contextMenu.mode === "selection" ? (
            <>
              {/* 动态渲染文字选择菜单 */}
              {selectionMenuConfig.items
                .filter(item => item.enabled)
                .map(item => {
                  const def = SELECTION_MENU_ITEMS.find(d => d.id === item.id);
                  if (!def) return null;
                  const actionMap: Record<string, () => void> = {
                    heading1: () => editor.chain().focus().setHeading({ level: 1 }).run(),
                    heading2: () => editor.chain().focus().setHeading({ level: 2 }).run(),
                    heading3: () => editor.chain().focus().setHeading({ level: 3 }).run(),
                    spoiler: toggleSpoiler,
                    bold: () => editor.chain().focus().toggleBold().run(),
                    italic: () => editor.chain().focus().toggleItalic().run(),
                    strike: () => editor.chain().focus().toggleStrike().run(),
                    underline: () => editor.chain().focus().toggleUnderline().run(),
                    link: toggleLink
                  };
                  const onClick = actionMap[item.id];
                  if (!onClick) return null;
                  return (
                    <MenuItem
                      key={item.id}
                      label={def.label}
                      onClick={onClick}
                      onComplete={closeContextMenu}
                    />
                  );
                })}
            </>
          ) : (
            <>
              {/* 动态渲染空白处菜单 */}
              {emptyMenuConfig.items
                .filter(item => item.enabled)
                .map(item => {
                  const def = EMPTY_MENU_ITEMS.find(d => d.id === item.id);
                  if (!def) return null;
                  const actionMap: Record<string, () => void> = {
                    insertImage: insertImage,
                    codeBlock: insertCodeBlock,
                    quote: insertQuote,
                    table: insertTable
                  };
                  const onClick = actionMap[item.id];
                  if (!onClick) return null;
                  return (
                    <MenuItem
                      key={item.id}
                      label={def.label}
                      onClick={onClick}
                      onComplete={closeContextMenu}
                    />
                  );
                })}
            </>
          )}
        </div>
      ) : null}
      </div>
    </>
  );
};

type MenuItemProps = {
  label: string;
  onClick: () => void;
  onComplete: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
};

const MenuItem: React.FC<MenuItemProps> = ({ label, onClick, onComplete, active, danger, disabled }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => {
      if (disabled) return;
      onClick();
      onComplete();
    }}
    style={{
      border: "none",
      background: active ? "rgba(102, 192, 244, 0.16)" : "transparent",
      textAlign: "left",
      padding: "0.55rem 0.75rem",
      color: danger ? "#ff8f8f" : disabled ? "rgba(205, 226, 255, 0.45)" : active ? "#e5f3ff" : "#cde2ff",
      borderRadius: "0.6rem",
      fontSize: "0.85rem",
      cursor: disabled ? "not-allowed" : "pointer",
      fontWeight: active ? 600 : 500
    }}
    onMouseDown={(event) => {
      event.preventDefault();
    }}
  >
    {label}
  </button>
);

const MenuSectionLabel: React.FC<{ label: string }> = ({ label }) => (
  <div
    style={{
      padding: "0.3rem 0.75rem 0.15rem",
      fontSize: "0.72rem",
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      color: "rgba(173, 205, 244, 0.7)"
    }}
  >
    {label}
  </div>
);

const MenuDivider: React.FC = () => (
  <div
    style={{
      height: "1px",
      margin: "0.25rem 0.5rem",
      background: "rgba(102, 192, 244, 0.18)"
    }}
  />
);

type ToolbarIconProps = {
  label: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  title?: string;
};

const ToolbarIcon: React.FC<ToolbarIconProps> = ({ label, onClick, active, title }) => (
  <button
    type="button"
    title={title}
    style={{
      ...toolbarButton,
      fontWeight: 600,
      fontSize: "0.9rem",
      background: active ? "rgba(102, 192, 244, 0.2)" : "transparent"
    }}
    onClick={onClick}
  >
    {label}
  </button>
);

export default TipTapEditor;
