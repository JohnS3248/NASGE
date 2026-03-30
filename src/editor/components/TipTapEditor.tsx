import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { createEditorExtensions, EMPTY_DOC } from "../utils/editorExtensions";
import { extractFilesFromPaste, extractFilesFromDrop } from "../utils/imageInput";
import { processIncomingImages } from "../services/imageIntake";
import { ImageUploadService } from "../services/ImageUploadService";
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
import { toast } from "../stores/useToastStore";
import { dialog } from "../stores/useDialogStore";
import { NASGE_IMAGE_MIME_TYPE, type ImageDragData } from "./ImageFloatingPanel";

// 类型别名，保持向后兼容
type ImageDisplayPreset = ImageSizePreset;

type TipTapEditorProps = {
  initialContent?: string;
  externalDoc?: JSONContent;
  onUpdate?: (payload: { html: string; json: JSONContent }) => void;
  onEditorReady?: (editor: import("@tiptap/core").Editor) => void;
};

type ImageContextPayload = {
  imageNodeId: string;
  pos: number | null; // 图片节点在文档中的位置
  sizePreset: ImageDisplayPreset; // 被点击图片的尺寸预设
  alignment: ImageAlignment; // 被点击图片的对齐方式
};

type ContextMenuMode = "selection" | "empty" | "image" | "table";

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

/**
 * 计算右键菜单位置，确保菜单不会超出视口边界
 * @param clientX 鼠标点击的 X 坐标
 * @param clientY 鼠标点击的 Y 坐标
 * @param menuWidth 菜单预估宽度
 * @param menuHeight 菜单预估高度
 */
function calcMenuPosition(
  clientX: number,
  clientY: number,
  menuWidth = 180,
  menuHeight = 280
): { x: number; y: number } {
  let x = clientX;
  let y = clientY;

  // 右侧边界检测
  if (x + menuWidth > window.innerWidth) {
    x = clientX - menuWidth;
  }

  // 底部边界检测：优先在点击位置下方显示
  // 如果下方空间不足，尝试在上方显示
  // 如果上方空间也不足，确保菜单底部不超出视口
  const spaceBelow = window.innerHeight - clientY;
  const spaceAbove = clientY;

  if (spaceBelow < menuHeight) {
    // 下方空间不足
    if (spaceAbove >= menuHeight) {
      // 上方空间足够，向上翻转
      y = clientY - menuHeight;
    } else {
      // 上下空间都不足，确保菜单底部不超出视口底部
      y = Math.max(0, window.innerHeight - menuHeight);
    }
  }

  // 确保不会超出左边界
  if (x < 0) x = 0;

  return { x, y };
}

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
  initialContent = "<p>欢迎使用 NASGE 编辑器。</p>",
  externalDoc,
  onUpdate,
  onEditorReady
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
  // === 右键菜单配置 ===
  const imageMenuConfig = useEditorConfigStore(state => state.imageMenuConfig);
  const selectionMenuConfig = useEditorConfigStore(state => state.selectionMenuConfig);
  const emptyMenuConfig = useEditorConfigStore(state => state.emptyMenuConfig);

  const editor = useEditor({
    extensions,
    content: externalDoc ?? EMPTY_DOC,
    editorProps: {
      attributes: {
        class: "nasge-editor focus:outline-none"
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
    }
  });

  // DEBUG: 暴露 editor 实例用于控制台测试
  useEffect(() => {
    if (editor) window.__editor = editor;
  }, [editor]);

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

  const toggleLink = useCallback(async () => {
    if (!editor) return;

    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const selectionText = editor.state.doc.textBetween(
      editor.state.selection.from,
      editor.state.selection.to
    );

    const url = await dialog.prompt({ message: "请输入链接地址", defaultValue: previousUrl ?? "https://" });
    if (url === null || url.trim() === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }

    let label = selectionText;
    if (!label) {
      label = (await dialog.prompt({ message: "显示文本（留空则使用链接本身）", defaultValue: url })) ?? url;
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
      if (node.type.name === "steamImage" || node.type.name === "steamImageInline") {
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
        // 获取节点类型以确定使用哪个节点名称
        const resolvedPos = editor.state.doc.resolve(pos);
        const node = resolvedPos.nodeAfter;
        const nodeTypeName = node?.type.name === "steamImageInline" ? "steamImageInline" : "steamImage";
        // 1. 更新 TipTap 节点属性
        editor.chain().focus().setNodeSelection(pos).updateAttributes(nodeTypeName, {
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
        // 获取节点类型以确定使用哪个节点名称
        const resolvedPos = editor.state.doc.resolve(pos);
        const node = resolvedPos.nodeAfter;
        const nodeTypeName = node?.type.name === "steamImageInline" ? "steamImageInline" : "steamImage";
        // 1. 更新 TipTap 节点属性
        editor.chain().focus().setNodeSelection(pos).updateAttributes(nodeTypeName, {
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
      const result = await ImageUploadService.uploadByNodeId(nodeId);
      if (!result.success) {
        throw new Error(result.error || "上传失败");
      }
      loggers.image.info('TipTapEditor 图片上传成功，预览码:', result.steamPreviewId);

      // 静默成功，无需弹窗
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      loggers.image.error('TipTapEditor 图片上传失败:', errorMessage);
      toast.error(`图片上传失败：${errorMessage}`);
    }
  }, [contextMenu, editor]);

  const insertImage = useCallback(async () => {
    if (!editor) return;
    const src = (await dialog.prompt({ message: "输入图片链接", defaultValue: "https://" }))?.trim();
    if (!src) return;
    const alt = (await dialog.prompt({ message: "图片描述（可选）", defaultValue: "" })) ?? "";
    editor.chain().focus().setImage({ src, alt }).run();
  }, [editor]);

  const insertQuote = useCallback(async () => {
    if (!editor) return;
    const author = (await dialog.prompt({ message: "引用来源（可选）", defaultValue: "" })) ?? "";
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

  useEffect(() => {
    const listener = () => closeContextMenu();
    window.addEventListener("click", listener);
    return () => window.removeEventListener("click", listener);
  }, [closeContextMenu]);

  // 向父组件暴露 editor 实例
  useEffect(() => {
    if (editor) onEditorReady?.(editor);
  }, [editor, onEditorReady]);

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

  return (
    <>
      <style>
        {`
          .nasge-editor-container .nasge-image-node img {
            margin: 0 !important;
            max-width: 100% !important;
            height: auto !important;
            display: block !important;
          }

          .nasge-editor-container .ProseMirror-selectednode .nasge-image-node,
          .nasge-editor-container .node-steamImage.ProseMirror-selectednode .nasge-image-node {
            outline: 2px solid rgba(102, 192, 244, 0.8);
            outline-offset: 2px;
          }

          .nasge-editor-container .ProseMirror-selectednode .nasge-image-inline-wrapper,
          .nasge-editor-container .node-steamImageInline.ProseMirror-selectednode .nasge-image-inline-wrapper {
            outline: 2px solid rgba(102, 192, 244, 0.8);
            outline-offset: 2px;
            border-radius: 4px;
          }
        `}
      </style>
      <div
        ref={editorContainerRef}
        className="nasge-editor-container flex-1 min-h-[260px] overflow-y-auto relative"
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
                // 从点击位置向前搜索最近的 steamImage 或 steamImageInline 节点
                const clickPos = coords.pos;
                editor.state.doc.descendants((node, pos) => {
                  if (node.type.name === "steamImage" || node.type.name === "steamImageInline") {
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

              loggers.editor.verbose('右键菜单 按位置找到:', { nodeSizePreset, nodeAlignment, imageNodeId, targetPos, clickPos: coords?.pos });

              // 计算菜单位置（图片菜单较高，预估 320px）
              const imageMenuPos = calcMenuPosition(event.clientX, event.clientY, 180, 320);
              setContextMenu({
                visible: true,
                x: imageMenuPos.x,
                y: imageMenuPos.y,
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

          // 检测是否在表格单元格内右键
          const tableCell = target?.closest<HTMLElement>("td, th");
          if (tableCell && target?.closest(".nasge-table")) {
            event.preventDefault();
            // 将光标移到右键点击的单元格内
            const coords = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (coords) {
              editor.chain().focus().setTextSelection(coords.pos).run();
            }
            const menuPos = calcMenuPosition(event.clientX, event.clientY, 180, 380);
            setContextMenu({
              visible: true,
              x: menuPos.x,
              y: menuPos.y,
              mode: "table"
            });
            return;
          }

          const mode: ContextMenuMode = editor.state.selection.empty ? "empty" : "selection";

          // 检查对应菜单的总开关
          const menuEnabled = mode === "selection" ? selectionMenuConfig.enabled : emptyMenuConfig.enabled;
          if (!menuEnabled) {
            return; // 使用浏览器原生菜单
          }

          event.preventDefault();
          // 计算菜单位置（选中菜单有更多选项，预估 350px 高）
          const menuPos = calcMenuPosition(event.clientX, event.clientY, 180, 350);
          setContextMenu({
            visible: true,
            x: menuPos.x,
            y: menuPos.y,
            mode
          });
        }}
      >
        <EditorContent editor={editor} />

        {/* 字符数统计 - 固定在编辑器右下角 */}
        <div
          className={`absolute bottom-3 right-3 text-[0.8rem] font-medium bg-[rgba(9,15,25,0.85)] px-2.5 py-1.5 rounded-lg backdrop-blur-sm pointer-events-none border ${characterInfo.exceeded ? 'border-danger/30' : 'border-accent/20'}`}
          style={{ color: getCharacterCountColor(characterInfo) }}
        >
          {getCharacterCountText(characterInfo)}
        </div>
      </div>

      {contextMenu.visible ? (
        <div
          className="fixed bg-bg-overlay border border-border-accent rounded-lg p-1 flex flex-col gap-1 min-w-[160px] z-[9999] shadow-xl"
          style={{ top: contextMenu.y, left: contextMenu.x }}
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
              <div className="px-3 py-2.5 text-text-secondary text-[0.8rem]">
                图片数据暂不可用。
              </div>
            )
          ) : contextMenu.mode === "table" ? (
            <>
              <MenuSectionLabel label="行操作" />
              <MenuItem label="上方插入行" onClick={() => editor.chain().focus().addRowBefore().run()} onComplete={closeContextMenu} />
              <MenuItem label="下方插入行" onClick={() => editor.chain().focus().addRowAfter().run()} onComplete={closeContextMenu} />
              <MenuItem label="删除当前行" onClick={() => editor.chain().focus().deleteRow().run()} onComplete={closeContextMenu} danger />
              <MenuDivider />
              <MenuSectionLabel label="列操作" />
              <MenuItem label="左侧插入列" onClick={() => editor.chain().focus().addColumnBefore().run()} onComplete={closeContextMenu} />
              <MenuItem label="右侧插入列" onClick={() => editor.chain().focus().addColumnAfter().run()} onComplete={closeContextMenu} />
              <MenuItem label="删除当前列" onClick={() => editor.chain().focus().deleteColumn().run()} onComplete={closeContextMenu} danger />
              <MenuDivider />
              <MenuSectionLabel label="嵌套" />
              <MenuItem label="在单元格内插入表格" onClick={() => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: false }).run()} onComplete={closeContextMenu} />
              <MenuDivider />
              <MenuItem label="删除整个表格" onClick={() => editor.chain().focus().deleteTable().run()} onComplete={closeContextMenu} danger />
            </>
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
    className={`border-0 text-left px-3 py-2 rounded-md text-[0.85rem] ${
      active ? 'bg-accent-muted font-semibold text-text-primary' : 'bg-transparent font-medium text-text-primary'
    } ${danger ? '!text-[#ff8f8f]' : ''} ${disabled ? '!text-text-muted cursor-not-allowed' : 'cursor-pointer'}`}
    onMouseDown={(event) => {
      event.preventDefault();
    }}
  >
    {label}
  </button>
);

const MenuSectionLabel: React.FC<{ label: string }> = ({ label }) => (
  <div className="px-3 pt-1 pb-0.5 text-[0.72rem] uppercase tracking-wider text-[rgba(173,205,244,0.7)]">
    {label}
  </div>
);

const MenuDivider: React.FC = () => (
  <div className="h-px mx-2 my-1 bg-border-default" />
);

export default TipTapEditor;
