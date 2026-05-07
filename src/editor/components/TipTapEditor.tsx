import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { createEditorExtensions, EMPTY_DOC } from "../utils/editorExtensions";
import { extractFilesFromPaste, extractFilesFromDrop } from "../utils/imageInput";
import { addFilesToPool } from "../services/imagePoolIntake";
import { ImageUploadService } from "../services/ImageUploadService";
import { deleteSteamImage } from "../services/steamBridge";
import { useImageStore } from "../stores/useImageStore";
import { useSteamGuideImageStore } from "../stores/useSteamGuideImageStore";
import { useImagePanelStore } from "../stores/useImagePanelStore";
import { MenuItem, MenuSectionLabel, MenuDivider } from "./ContextMenuParts";
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
import { SkeletonLine, SkeletonBlock } from "./Skeleton";
import ExternalImageDialog from "./ExternalImageDialog";

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

/** 编辑器初始化骨架屏 — 匹配编辑器布局避免 CLS */
function EditorSkeleton() {
  return (
    <div className="flex-1 min-h-[260px] p-6 space-y-5">
      {/* 模拟工具栏区域 */}
      <div className="flex gap-2">
        <SkeletonBlock width={32} height={32} />
        <SkeletonBlock width={32} height={32} />
        <SkeletonBlock width={32} height={32} />
        <SkeletonBlock width={48} height={32} />
        <SkeletonBlock width={32} height={32} />
      </div>
      {/* 模拟文本内容 */}
      <div className="space-y-3 pt-2">
        <SkeletonLine width="45%" height={20} />
        <SkeletonLine width="100%" />
        <SkeletonLine width="92%" />
        <SkeletonLine width="100%" />
        <SkeletonLine width="78%" />
        <SkeletonLine width="100%" />
        <SkeletonLine width="85%" />
        <SkeletonLine width="60%" />
      </div>
    </div>
  );
}

const TipTapEditor: React.FC<TipTapEditorProps> = ({
  initialContent,
  externalDoc,
  onUpdate,
  onEditorReady
}) => {
  const { t } = useTranslation('editor');
  const resolvedInitialContent = initialContent ?? `<p>${t('welcomeContent')}</p>`;
  const extensions = useMemo(() => createEditorExtensions(), []);
  const ignoreNextUpdateRef = useRef(false);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(INITIAL_CONTEXT_MENU);
  const contextMenuRef = useRef<HTMLDivElement>(null);
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

  // === 图片节点状态 ===
  const contextMenuImageEntity = useImageStore(
    useCallback(
      (state) => {
        if (contextMenu.mode !== "image" || !contextMenu.payload?.imageNodeId) {
          return undefined;
        }
        const nodeId = contextMenu.payload.imageNodeId;
        return (
          state.getImageById(nodeId) ??
          state.getImageBySourceNodeId(nodeId) ??
          state.getImageBySteamPreviewId(nodeId)
        );
      },
      [contextMenu]
    )
  );

  // 图片节点数据（用于 UI 显示）
  const contextMenuImageNode = useMemo(() => {
    if (!contextMenuImageEntity) return undefined;
    return {
      nodeId: contextMenuImageEntity.sourceNodeId ?? contextMenuImageEntity.id,
      display: {
        preset: contextMenuImageEntity.display.preset,
        alignment: contextMenuImageEntity.display.alignment,
        customWidthPx: contextMenuImageEntity.display.customWidthPx
      }
    };
  }, [contextMenuImageEntity]);

  const updateImageDisplayStore = useImageStore((state) => state.updateDisplay);
  const removeImageStore = useImageStore((state) => state.removeImage);

  // 通过 TipTap 节点的 imageNodeId 更新图片显示设置
  const updateImageDisplay = useCallback(
    (nodeId: string, patch: Partial<{ preset: ImageDisplayPreset; alignment: ImageAlignment; customWidthPx?: number }>) => {
      const store = useImageStore.getState();
      const imageEntity =
        store.getImageById(nodeId) ??
        store.getImageBySourceNodeId(nodeId) ??
        store.getImageBySteamPreviewId(nodeId);
      if (imageEntity) {
        updateImageDisplayStore(imageEntity.id, patch);
      }
    },
    [updateImageDisplayStore]
  );

  // 通过 TipTap 节点的 imageNodeId 删除图片
  const removeImageNode = useCallback(
    (nodeId: string) => {
      const store = useImageStore.getState();
      const imageEntity =
        store.getImageById(nodeId) ??
        store.getImageBySourceNodeId(nodeId) ??
        store.getImageBySteamPreviewId(nodeId);
      if (imageEntity) {
        removeImageStore(imageEntity.id);
      }
    },
    [removeImageStore]
  );

  const toggleLink = useCallback(async () => {
    if (!editor) return;

    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const selectionText = editor.state.doc.textBetween(
      editor.state.selection.from,
      editor.state.selection.to
    );

    const url = await dialog.prompt({ message: t('link.inputUrl'), defaultValue: previousUrl ?? "https://" });
    if (url === null || url.trim() === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }

    let label = selectionText;
    if (!label) {
      label = (await dialog.prompt({ message: t('link.displayText'), defaultValue: url })) ?? url;
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
  }, [editor, t]);

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

  // 图片右键 — NodeView 内 onContextMenu 派发 CustomEvent,容器层在此监听
  // pos / attrs 由 NodeView 的 props.getPos() / props.node.attrs 提供,与触发节点严格对应
  useEffect(() => {
    const el = editorContainerRef.current;
    if (!el || !editor) return;
    const handler = (e: Event) => {
      if (!imageMenuConfig.enabled) return;
      const ce = e as CustomEvent<{
        pos: number;
        attrs: Record<string, unknown>;
        clientX: number;
        clientY: number;
      }>;
      const { pos, attrs, clientX, clientY } = ce.detail;
      // 视觉选中状态用同一个 pos,蓝框出现在被右键的图片上
      editor.chain().focus().setNodeSelection(pos).run();
      const imageNodeId =
        (attrs.imageNodeId as string | null) ??
        (attrs.previewId as string | null) ??
        (attrs.fileName as string | null) ??
        null;
      if (!imageNodeId) return;
      setContextMenu({
        visible: true,
        x: clientX,
        y: clientY,
        mode: "image",
        payload: {
          imageNodeId,
          pos,
          sizePreset: (attrs.sizePreset as ImageDisplayPreset) || "original",
          alignment: (attrs.alignment as ImageAlignment) || "inline"
        }
      });
    };
    el.addEventListener("nasge-image-contextmenu", handler as EventListener);
    return () => el.removeEventListener("nasge-image-contextmenu", handler as EventListener);
  }, [editor, imageMenuConfig.enabled]);

  // 渲染后根据实际菜单尺寸调整位置，防止溢出视口
  useLayoutEffect(() => {
    const el = contextMenuRef.current;
    if (!contextMenu.visible || !el) return;

    const rect = el.getBoundingClientRect();
    let x = contextMenu.x;
    let y = contextMenu.y;
    let adjusted = false;

    if (x + rect.width > window.innerWidth) {
      x = Math.max(0, window.innerWidth - rect.width);
      adjusted = true;
    }
    if (y + rect.height > window.innerHeight) {
      y = Math.max(0, window.innerHeight - rect.height);
      adjusted = true;
    }

    if (adjusted) {
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    }
  }, [contextMenu]);

  // 图片选中 / 修改 / 删除统一用 contextMenu.payload.pos —
  // 这个 pos 来自 NodeView onContextMenu 的 props.getPos()(单 source of truth),
  // 与 imageNodeId 必然指向同一节点。不再依赖 posAtCoords / descendants 遍历查找。

  const applyImagePreset = useCallback(
    (preset: ImageDisplayPreset) => {
      if (!editor || contextMenu.mode !== "image" || !contextMenu.payload?.imageNodeId) {
        return;
      }
      const pos = contextMenu.payload.pos;
      const nodeId = contextMenu.payload.imageNodeId;
      if (pos == null) return;
      const resolvedPos = editor.state.doc.resolve(pos);
      const node = resolvedPos.nodeAfter;
      const nodeTypeName = node?.type.name === "steamImageInline" ? "steamImageInline" : "steamImage";
      editor.chain().focus().setNodeSelection(pos).updateAttributes(nodeTypeName, {
        sizePreset: preset
      }).run();
      updateImageDisplay(nodeId, { preset });
    },
    [contextMenu, editor, updateImageDisplay]
  );

  const applyImageAlignment = useCallback(
    (alignment: ImageAlignment) => {
      if (!editor || contextMenu.mode !== "image" || !contextMenu.payload?.imageNodeId) {
        return;
      }
      const pos = contextMenu.payload.pos;
      const nodeId = contextMenu.payload.imageNodeId;
      if (pos == null) return;
      const resolvedPos = editor.state.doc.resolve(pos);
      const node = resolvedPos.nodeAfter;
      const nodeTypeName = node?.type.name === "steamImageInline" ? "steamImageInline" : "steamImage";
      editor.chain().focus().setNodeSelection(pos).updateAttributes(nodeTypeName, {
        alignment
      }).run();
      updateImageDisplay(nodeId, { alignment });
    },
    [contextMenu, editor, updateImageDisplay]
  );

  const handleDeleteImage = useCallback(() => {
    if (!editor || contextMenu.mode !== "image" || !contextMenu.payload?.imageNodeId) {
      return;
    }
    // 用 NodeView 上传的 pos 显式选中再删,不依赖当前 selection(可能错位)
    const pos = contextMenu.payload.pos;
    const nodeId = contextMenu.payload.imageNodeId;
    if (pos == null) return;

    // 拿要删节点的 previewId,用于删除后检查 doc 中是否还有相同 previewId 的节点引用
    // 避免多张同 previewId 图共享 store entity 时 removeImageNode 一并删掉,导致剩余图变 orphan
    const resolvedPos = editor.state.doc.resolve(pos);
    const targetNode = resolvedPos.nodeAfter;
    const previewIdToDelete = (targetNode?.attrs?.previewId as string | null) ?? null;

    editor.chain().focus().setNodeSelection(pos).deleteSelection().run();

    let stillReferenced = false;
    if (previewIdToDelete) {
      editor.state.doc.descendants((n) => {
        if (
          (n.type.name === "steamImage" || n.type.name === "steamImageInline") &&
          n.attrs.previewId === previewIdToDelete
        ) {
          stillReferenced = true;
          return false;
        }
        return true;
      });
    }
    if (!stillReferenced) {
      removeImageNode(nodeId);
    }
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      loggers.image.error('TipTapEditor 图片上传失败:', errorMessage);
      toast.error(t('image.uploadFail', { error: errorMessage }));
    }
  }, [contextMenu, editor, t]);

  const handleDeleteSteamImage = useCallback(async () => {
    if (!editor || contextMenu.mode !== "image" || !contextMenu.payload?.imageNodeId) return;

    const nodeId = contextMenu.payload.imageNodeId;
    const store = useImageStore.getState();
    const imageEntity =
      store.getImageById(nodeId) ??
      store.getImageBySourceNodeId(nodeId) ??
      store.getImageBySteamPreviewId(nodeId);

    if (!imageEntity?.steamPreviewId) return;

    const confirmed = await dialog.confirm({
      message: t('image.deleteSteamConfirm', { fileName: imageEntity.fileName }),
      danger: true
    });
    if (!confirmed) return;

    try {
      await deleteSteamImage(imageEntity.steamPreviewId);
      useSteamGuideImageStore.getState().removeItem(imageEntity.steamPreviewId);
      editor.chain().focus().deleteSelection().run();
      removeImageNode(nodeId);
      toast.success(t('image.deleteSteamSuccess'));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      loggers.image.error('TipTapEditor Steam 图片删除失败:', errorMsg);
      toast.error(t('image.deleteFail', { error: errorMsg }));
    }
  }, [contextMenu, editor, removeImageNode, t]);

  const insertImage = useCallback(async () => {
    if (!editor) return;
    const src = (await dialog.prompt({ message: t('imageLink.inputUrl'), defaultValue: "https://" }))?.trim();
    if (!src) return;
    const alt = (await dialog.prompt({ message: t('imageLink.altText'), defaultValue: "" })) ?? "";
    editor.chain().focus().setImage({ src, alt }).run();
  }, [editor, t]);

  // 外链图片弹窗
  const [externalImageDialogVisible, setExternalImageDialogVisible] = useState(false);

  const insertExternalImage = useCallback(() => {
    setExternalImageDialogVisible(true);
  }, []);

  const handleExternalImageConfirm = useCallback((url: string) => {
    setExternalImageDialogVisible(false);
    if (!editor) return;
    editor.commands.insertSteamImage({
      previewId: "1",  // 假 ID,Steam 不校验
      fileName: "",
      sizePreset: "original",
      alignment: "inline",
      source: "screenshot",
      imageUrl: url
    });
    loggers.editor.info("插入外链图片", { url });
  }, [editor]);

  const insertQuote = useCallback(async () => {
    if (!editor) return;
    const author = (await dialog.prompt({ message: t('quote.source'), defaultValue: "" })) ?? "";
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
                content: [{ type: "text", text: t('quote.prefix', { author }) }]
              }]
            : []),
          { type: "paragraph", content: [] }
        ]
      })
      .run();
  }, [editor, t]);

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

  // 获取悬浮窗插入设置
  const { defaultInsertSize, defaultInsertAlignment, defaultInsertPlacement, afterInsertAction, close: closeImagePanel, minimize: minimizeImagePanel } = useImagePanelStore();

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
        small: "thumb",
        full: "full"
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
      const isScreenshot = dragData.type === "steam-screenshot";
      for (const image of dragData.images) {
        // 本地图片（未上传，previewId 为空）：主动在 useImageStore 注册，确保身份链完整
        let resolvedImageNodeId: string | null = null;
        if (!image.previewId) {
          const entity = useImageStore.getState().addLocalImage({
            fileName: image.fileName,
            originalName: image.fileName,
            fileSize: 0,
            mimeType: "image/unknown",
            source: "drop",
            localPreviewUrl: image.localUrl || image.thumbnailUrl,
            display: { preset: sizePreset, alignment }
          });
          resolvedImageNodeId = entity.id;
        }

        const insertAttrs = {
          imageNodeId: resolvedImageNodeId,
          previewId: image.previewId || null,
          fileName: image.fileName,
          previewDataUrl: image.localUrl || image.thumbnailUrl || null,
          sizePreset,
          alignment,
          ...(isScreenshot && image.imageUrl ? {
            source: "screenshot",
            imageUrl: image.imageUrl
          } : {})
        };
        if (defaultInsertPlacement === "inline") {
          editor.commands.insertSteamImageInline(insertAttrs);
        } else {
          editor.commands.insertSteamImage(insertAttrs);
        }

        loggers.image.verbose("插入图片节点", {
          fileName: image.fileName,
          previewId: image.previewId,
          sizePreset,
          alignment,
          placement: defaultInsertPlacement,
          isScreenshot
        });
      }

      // 执行插入后动作
      if (afterInsertAction === "close") {
        closeImagePanel();
      } else if (afterInsertAction === "minimize") {
        minimizeImagePanel();
      }
    },
    [editor, defaultInsertSize, defaultInsertAlignment, defaultInsertPlacement, afterInsertAction, closeImagePanel, minimizeImagePanel]
  );

  useEffect(() => {
    if (!editor) return;

    const dom = editor.view.dom;

    const onPaste = (event: ClipboardEvent) => {
      const files = extractFilesFromPaste(event);
      if (!files.length) return;
      event.preventDefault();
      event.stopPropagation();

      const currentArchiveId = useGuideStore.getState().currentArchiveId;
      void addFilesToPool(files, { source: "paste", currentArchiveId, openPanelOnAdd: true });
    };

    const onDrop = (event: DragEvent) => {
      // 优先检查是否为 NASGE 图片拖放
      const nasgeData = event.dataTransfer?.getData(NASGE_IMAGE_MIME_TYPE);
      if (nasgeData) {
        event.preventDefault();
        event.stopPropagation();

        try {
          const dragData = JSON.parse(nasgeData) as ImageDragData;
          if ((dragData.type === "steam-image" || dragData.type === "steam-screenshot") && dragData.images?.length > 0) {
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

      // 处理普通文件拖放 → 走图片池流程（与 onPaste 统一）
      const files = extractFilesFromDrop(event);
      if (!files.length) return;
      event.preventDefault();
      event.stopPropagation();

      const currentArchiveId = useGuideStore.getState().currentArchiveId;
      void addFilesToPool(files, { source: "drop", currentArchiveId, openPanelOnAdd: true });
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
  }, [editor, handleNasgeImageDrop]);

  useEffect(() => {
    if (!editor || externalDoc === undefined) return;
    ignoreNextUpdateRef.current = true;
    editor.commands.setContent(externalDoc ?? EMPTY_DOC, { emitUpdate: false });
    // 更新字符数信息
    setCharacterInfo(checkCharacterLimit(editor, CONTENT_CHARACTER_LIMIT));
  }, [editor, externalDoc]);

  if (!editor) return <EditorSkeleton />;

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
        className="group nasge-editor-container flex-1 min-h-[260px] overflow-y-auto relative"
        onContextMenu={(event) => {
          if (!editor) {
            return;
          }

          const target = event.target as HTMLElement;
          // 图片右键已由 SteamImage / SteamImageInline NodeView 在 onContextMenu 内
          // 通过 props.getPos() 拿 pos + 派发 nasge-image-contextmenu CustomEvent 处理,
          // 容器层的 useEffect listener 接管菜单弹出。这里不再处理图片右键。

          // 检测是否在表格单元格内右键
          const tableCell = target?.closest<HTMLElement>("td, th");
          if (tableCell && target?.closest(".nasge-table")) {
            event.preventDefault();
            // 将光标移到右键点击的单元格内
            const coords = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (coords) {
              editor.chain().focus().setTextSelection(coords.pos).run();
            }
            setContextMenu({
              visible: true,
              x: event.clientX,
              y: event.clientY,
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
          setContextMenu({
            visible: true,
            x: event.clientX,
            y: event.clientY,
            mode
          });
        }}
      >
        <EditorContent editor={editor} />

        {/* 字符数统计 - 固定在编辑器右下角，默认半透明，hover 编辑区或接近上限时完整显示 */}
        <div
          className={`absolute bottom-3 right-3 text-[0.75rem] font-medium px-2 py-1 rounded-md backdrop-blur-sm pointer-events-none border transition-opacity duration-300 ${
            characterInfo.exceeded
              ? 'bg-danger/15 border-danger/30 opacity-100'
              : characterInfo.warning
                ? 'bg-[rgba(9,15,25,0.85)] border-accent/20 opacity-100'
                : 'bg-[rgba(9,15,25,0.7)] border-transparent opacity-0 group-hover:opacity-60'
          }`}
          style={{ color: getCharacterCountColor(characterInfo) }}
        >
          {getCharacterCountText(characterInfo)}
        </div>
      </div>

      {contextMenu.visible ? (
        <div
          ref={contextMenuRef}
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
                  const groupLabel = group.groupId === 'preset' ? t('image.size')
                    : group.groupId === 'align' ? t('image.align')
                    : null; // action 组无标签

                  // i18n label mapping for image menu items
                  const imageMenuI18nKeys: Record<string, string> = {
                    'preset-original': t('image.original'),
                    'preset-half': t('image.half'),
                    'preset-full': t('image.full'),
                    'align-floatLeft': t('image.alignLeft'),
                    'align-floatRight': t('image.alignRight'),
                    'align-inline': t('image.inline'),
                    'upload': t('image.upload'),
                    'deleteSteam': t('image.deleteSteam'),
                    'delete': t('image.delete')
                  };

                  return (
                    <React.Fragment key={group.groupId}>
                      {groupIndex > 0 && <MenuDivider />}
                      {groupLabel && <MenuSectionLabel label={groupLabel} />}
                      {enabledItems.map(item => {
                        const def = groupDefs.find(d => d.id === item.id);
                        if (!def) return null;
                        const label = imageMenuI18nKeys[item.id] ?? def.label;

                        // 根据 id 确定 onClick 和 active 状态
                        // 使用 payload 中的值（从被点击的 TipTap 节点读取），而非 Store 数据
                        if (group.groupId === 'preset') {
                          const preset = item.id.replace('preset-', '') as ImageSizePreset;
                          return (
                            <MenuItem
                              key={item.id}
                              label={label}
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
                              label={label}
                              active={contextMenu.payload?.alignment === alignment}
                              onClick={() => applyImageAlignment(alignment)}
                              onComplete={closeContextMenu}
                            />
                          );
                        } else {
                          // action 组
                          const hasSteamPreviewId = !!contextMenuImageEntity?.steamPreviewId;
                          const actionMap: Record<string, { onClick: () => void; danger?: boolean; disabled?: boolean }> = {
                            upload: { onClick: handleUploadImage },
                            deleteSteam: { onClick: handleDeleteSteamImage, danger: true, disabled: !hasSteamPreviewId },
                            delete: { onClick: handleDeleteImage, danger: true }
                          };
                          const action = actionMap[item.id];
                          if (!action) return null;
                          return (
                            <MenuItem
                              key={item.id}
                              label={label}
                              onClick={action.onClick}
                              onComplete={closeContextMenu}
                              danger={action.danger}
                              disabled={action.disabled}
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
                {t('image.dataUnavailable')}
              </div>
            )
          ) : contextMenu.mode === "table" ? (
            <>
              <MenuSectionLabel label={t('table.rowOps')} />
              <MenuItem label={t('table.insertAbove')} onClick={() => editor.chain().focus().addRowBefore().run()} onComplete={closeContextMenu} />
              <MenuItem label={t('table.insertBelow')} onClick={() => editor.chain().focus().addRowAfter().run()} onComplete={closeContextMenu} />
              <MenuItem label={t('table.deleteRow')} onClick={() => editor.chain().focus().deleteRow().run()} onComplete={closeContextMenu} danger />
              <MenuDivider />
              <MenuSectionLabel label={t('table.colOps')} />
              <MenuItem label={t('table.insertLeft')} onClick={() => editor.chain().focus().addColumnBefore().run()} onComplete={closeContextMenu} />
              <MenuItem label={t('table.insertRight')} onClick={() => editor.chain().focus().addColumnAfter().run()} onComplete={closeContextMenu} />
              <MenuItem label={t('table.deleteCol')} onClick={() => editor.chain().focus().deleteColumn().run()} onComplete={closeContextMenu} danger />
              <MenuDivider />
              <MenuSectionLabel label={t('table.nesting')} />
              <MenuItem label={t('table.insertNested')} onClick={() => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: false }).run()} onComplete={closeContextMenu} />
              <MenuDivider />
              <MenuItem label={t('table.deleteTable')} onClick={() => editor.chain().focus().deleteTable().run()} onComplete={closeContextMenu} danger />
            </>
          ) : contextMenu.mode === "selection" ? (
            <>
              {/* 动态渲染文字选择菜单 */}
              {(() => {
                const selectionMenuI18nKeys: Record<string, string> = {
                  heading1: t('contextMenu.heading1'),
                  heading2: t('contextMenu.heading2'),
                  heading3: t('contextMenu.heading3'),
                  spoiler: t('contextMenu.spoiler'),
                  bold: t('contextMenu.bold'),
                  italic: t('contextMenu.italic'),
                  strike: t('contextMenu.strike'),
                  underline: t('contextMenu.underline'),
                  link: t('contextMenu.link')
                };
                return selectionMenuConfig.items
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
                        label={selectionMenuI18nKeys[item.id] ?? def.label}
                        onClick={onClick}
                        onComplete={closeContextMenu}
                      />
                    );
                  });
              })()}
            </>
          ) : (
            <>
              {/* 动态渲染空白处菜单 */}
              {(() => {
                const emptyMenuI18nKeys: Record<string, string> = {
                  insertExternalImage: t('contextMenu.insertExternalImage'),
                  codeBlock: t('contextMenu.insertCodeBlock'),
                  quote: t('contextMenu.insertQuote'),
                  table: t('contextMenu.insertTable')
                };
                return emptyMenuConfig.items
                  .filter(item => item.enabled)
                  .map(item => {
                    const def = EMPTY_MENU_ITEMS.find(d => d.id === item.id);
                    if (!def) return null;
                    const actionMap: Record<string, () => void> = {
                      insertExternalImage: insertExternalImage,
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
                        label={emptyMenuI18nKeys[item.id] ?? def.label}
                        onClick={onClick}
                        onComplete={closeContextMenu}
                      />
                    );
                  });
              })()}
            </>
          )}
        </div>
      ) : null}

      {/* 外链图片弹窗 */}
      <ExternalImageDialog
        visible={externalImageDialogVisible}
        onConfirm={handleExternalImageConfirm}
        onCancel={() => setExternalImageDialogVisible(false)}
      />
    </>
  );
};

export default TipTapEditor;
