import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditor, EditorContent } from '@tiptap/react';
import { JSONContent } from '@tiptap/core';
import { createEditorExtensions } from '../utils/editorExtensions';
import { titleHasImage } from '../utils/titleHelpers';
import { extractFilesFromPaste, extractFilesFromDrop } from '../utils/imageInput';
import { addFilesToPool } from '../services/imagePoolIntake';
import { NASGE_IMAGE_MIME_TYPE, type ImageDragData } from './ImageFloatingPanel';
import { ImageUploadService } from '../services/ImageUploadService';
import { useImageStore } from '../stores/useImageStore';
import { useImagePanelStore } from '../stores/useImagePanelStore';
import { useGuideStore } from '../stores/useGuideStore';
import { MenuItem, MenuSectionLabel, MenuDivider } from './ContextMenuParts';
import type { ImageSizePreset, ImageAlignment } from '../types/image';
import { checkCharacterLimit, getCharacterCountColor, getCharacterCountText } from '../utils/characterLimit';
import { TITLE_CHARACTER_LIMIT } from '../constants/limits';
import { loggers } from '../../shared/logger';
import { toast } from '../stores/useToastStore';

// 类型别名，保持向后兼容
type ImageDisplayPreset = ImageSizePreset;

interface TitleEditorProps {
  value: JSONContent;
  onChange: (newValue: JSONContent) => void;
}

type ImageContextPayload = {
  imageNodeId: string;
  pos: number | null;
  sizePreset: ImageSizePreset;
  alignment: ImageAlignment;
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

/**
 * 标题编辑器组件 - 使用完整的 TipTap 编辑器
 *
 * 特性：
 * - 支持富文本编辑（图片、粗体等）
 * - 默认高度：1行文本（约 40px）
 * - 自动扩展：插入图片后自动调整高度以适应图片
 * - 支持拖拽/粘贴图片
 */
const TitleEditor: React.FC<TitleEditorProps> = ({
  value,
  onChange
}) => {
  const { t } = useTranslation('editor');
  // 检测标题中是否包含图片
  const [hasImage, setHasImage] = useState(false);
  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(INITIAL_CONTEXT_MENU);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  // 字符数限制信息
  const [characterInfo, setCharacterInfo] = useState(() => ({
    length: 0,
    remaining: TITLE_CHARACTER_LIMIT,
    exceeded: false,
    warning: false,
    limit: TITLE_CHARACTER_LIMIT
  }));
  // === 图片节点存储 ===
  const updateImageDisplayStore = useImageStore((state) => state.updateDisplay);
  const removeImageStore = useImageStore((state) => state.removeImage);

  // 通过 imageNodeId 解析图片实体
  const resolveImage = useCallback((nodeId: string) => {
    const store = useImageStore.getState();
    return (
      store.getImageById(nodeId) ??
      store.getImageBySourceNodeId(nodeId) ??
      store.getImageBySteamPreviewId(nodeId)
    );
  }, []);

  const updateImageDisplay = useCallback(
    (nodeId: string, patch: Partial<{ preset: ImageDisplayPreset; alignment: ImageAlignment; customWidthPx?: number }>) => {
      const imageEntity = resolveImage(nodeId);
      if (imageEntity) {
        updateImageDisplayStore(imageEntity.id, patch);
      }
    },
    [updateImageDisplayStore, resolveImage]
  );

  const removeImageNode = useCallback(
    (nodeId: string) => {
      const imageEntity = resolveImage(nodeId);
      if (imageEntity) {
        removeImageStore(imageEntity.id);
      }
    },
    [removeImageStore, resolveImage]
  );

  // 创建 TipTap 编辑器实例
  const editor = useEditor({
    extensions: createEditorExtensions(),
    content: value,
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      onChange(json);
      // 检测内容中是否有图片
      setHasImage(titleHasImage(json));
      // 更新字符数信息
      setCharacterInfo(checkCharacterLimit(editor, TITLE_CHARACTER_LIMIT));
    },
    editorProps: {
      attributes: {
        class: 'title-editor-content',
        style: hasImage
          ? 'min-height: 30px; max-height: none;'
          : 'min-height: 30px; max-height: 30px; overflow-y: auto;'
      }
    }
  });

  // 同步外部值变化
  useEffect(() => {
    if (editor && value) {
      const currentContent = editor.getJSON();
      // 只在内容真正不同时才更新，避免光标跳动
      if (JSON.stringify(currentContent) !== JSON.stringify(value)) {
        editor.commands.setContent(value);
      }
      // 同步检测图片状态
      setHasImage(titleHasImage(value));
      // 更新字符数信息
      setCharacterInfo(checkCharacterLimit(editor, TITLE_CHARACTER_LIMIT));
    }
  }, [editor, value]);

  // 关闭右键菜单
  const closeContextMenu = useCallback(() => {
    setContextMenu(INITIAL_CONTEXT_MENU);
  }, []);

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

  // 从 payload 直接读取当前 preset/alignment（来自节点 attrs，与 TipTapEditor 一致）
  const contextMenuImageNode = contextMenu.mode === "image" && contextMenu.payload
    ? {
        display: {
          preset: contextMenu.payload.sizePreset,
          alignment: contextMenu.payload.alignment
        }
      }
    : undefined;

  // 应用图片尺寸预设（双写：TipTap 节点属性 + Store）
  const applyImagePreset = useCallback((preset: ImageDisplayPreset) => {
    if (!editor || contextMenu.mode !== "image" || !contextMenu.payload?.imageNodeId) return;
    const pos = contextMenu.payload.pos;
    const nodeId = contextMenu.payload.imageNodeId;
    if (pos !== null) {
      editor.chain().focus().setNodeSelection(pos).updateAttributes("steamImage", {
        sizePreset: preset
      }).run();
      updateImageDisplay(nodeId, { preset });
    }
  }, [contextMenu, editor, updateImageDisplay]);

  // 应用图片对齐方式（双写：TipTap 节点属性 + Store）
  const applyImageAlignment = useCallback((alignment: ImageAlignment) => {
    if (!editor || contextMenu.mode !== "image" || !contextMenu.payload?.imageNodeId) return;
    const pos = contextMenu.payload.pos;
    const nodeId = contextMenu.payload.imageNodeId;
    if (pos !== null) {
      editor.chain().focus().setNodeSelection(pos).updateAttributes("steamImage", {
        alignment
      }).run();
      updateImageDisplay(nodeId, { alignment });
    }
  }, [contextMenu, editor, updateImageDisplay]);

  // 删除图片（双写：TipTap 删除节点 + Store 移除记录）
  const handleDeleteImage = useCallback(() => {
    if (!editor || contextMenu.mode !== "image" || !contextMenu.payload?.imageNodeId) {
      return;
    }
    const pos = contextMenu.payload.pos;
    const nodeId = contextMenu.payload.imageNodeId;
    if (pos !== null) {
      editor.chain().focus().setNodeSelection(pos).deleteSelection().run();
    } else {
      editor.chain().focus().deleteSelection().run();
    }
    removeImageNode(nodeId);
  }, [contextMenu, editor, removeImageNode]);

  // 上传图片
  const handleUploadImage = useCallback(async () => {
    if (!contextMenu.payload?.imageNodeId) {
      return;
    }

    try {
      const result = await ImageUploadService.uploadByNodeId(contextMenu.payload.imageNodeId);
      if (!result.success) {
        throw new Error(result.error || "上传失败");
      }
      loggers.image.info('TitleEditor 图片上传成功');
    } catch (error) {
      loggers.image.error('TitleEditor 图片上传失败:', error);
      toast.error(t('image.uploadFail', { error: error instanceof Error ? error.message : '未知错误' }));
    }
  }, [contextMenu.payload, t]);

  // 处理从图片池拖入的 NASGE 内部图片（与 TipTapEditor 逻辑一致）
  const { defaultInsertSize, defaultInsertAlignment, afterInsertAction, close: closeImagePanel, minimize: minimizeImagePanel } = useImagePanelStore();

  const handleNasgeImageDrop = useCallback(
    (dragData: ImageDragData, dropPosition?: number) => {
      if (!editor) return;

      if (dropPosition !== undefined) {
        editor.chain().focus().setTextSelection(dropPosition).run();
      } else {
        editor.commands.focus();
      }

      const sizePresetMap: Record<string, ImageSizePreset> = {
        original: "original",
        medium: "half",
        small: "thumb"
      };
      const sizePreset = sizePresetMap[defaultInsertSize] || "original";

      const alignmentMap: Record<string, ImageAlignment> = {
        floatLeft: "floatLeft",
        floatRight: "floatRight",
        center: "inline",
        inline: "inline"
      };
      const alignment = alignmentMap[defaultInsertAlignment] || "inline";

      const isScreenshot = dragData.type === "steam-screenshot";
      for (const image of dragData.images) {
        editor.commands.insertSteamImage({
          previewId: image.previewId || null,
          fileName: image.fileName,
          previewDataUrl: image.localUrl || image.thumbnailUrl || null,
          sizePreset,
          alignment,
          ...(isScreenshot && image.imageUrl ? {
            source: "screenshot",
            imageUrl: image.imageUrl
          } : {})
        });
      }

      if (afterInsertAction === "close") {
        closeImagePanel();
      } else if (afterInsertAction === "minimize") {
        minimizeImagePanel();
      }
    },
    [editor, defaultInsertSize, defaultInsertAlignment, afterInsertAction, closeImagePanel, minimizeImagePanel]
  );

  // 添加粘贴和拖拽事件监听器 — 统一走 addFilesToPool 管线（与 TipTapEditor 一致）
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
      // 优先检查是否为 NASGE 图片池内部拖放
      const nasgeData = event.dataTransfer?.getData(NASGE_IMAGE_MIME_TYPE);
      if (nasgeData) {
        event.preventDefault();
        event.stopPropagation();

        try {
          const dragData = JSON.parse(nasgeData) as ImageDragData;
          if ((dragData.type === "steam-image" || dragData.type === "steam-screenshot") && dragData.images?.length > 0) {
            const coords = editor.view.posAtCoords({
              left: event.clientX,
              top: event.clientY
            });
            handleNasgeImageDrop(dragData, coords?.pos);
            return;
          }
        } catch (e) {
          loggers.image.warn("TitleEditor 解析 NASGE 拖放数据失败:", e);
        }
      }

      // 处理普通文件拖放 → 走图片池流程
      const files = extractFilesFromDrop(event);
      if (!files.length) return;
      event.preventDefault();
      event.stopPropagation();

      const currentArchiveId = useGuideStore.getState().currentArchiveId;
      void addFilesToPool(files, { source: "drop", currentArchiveId, openPanelOnAdd: true });
    };

    const onDragOver = (event: DragEvent) => {
      // NASGE 内部拖放也需要 dragover 允许
      if (event.dataTransfer?.types.includes(NASGE_IMAGE_MIME_TYPE)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        return;
      }
      const files = extractFilesFromDrop(event);
      if (!files.length) return;
      event.preventDefault();
    };

    dom.addEventListener('paste', onPaste as EventListener);
    dom.addEventListener('drop', onDrop as EventListener);
    dom.addEventListener('dragover', onDragOver as EventListener);

    return () => {
      dom.removeEventListener('paste', onPaste as EventListener);
      dom.removeEventListener('drop', onDrop as EventListener);
      dom.removeEventListener('dragover', onDragOver as EventListener);
    };
  }, [editor, handleNasgeImageDrop]);

  // 点击外部关闭右键菜单
  useEffect(() => {
    if (!contextMenu.visible) return;

    const handleClickOutside = () => {
      closeContextMenu();
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [contextMenu.visible, closeContextMenu]);

  if (!editor) {
    return null;
  }

  return (
    <div className="relative flex flex-col bg-bg-input border border-border-accent rounded-xl p-5 shadow-xl">
      {/* 标题编辑器内容区 */}
      <div
        className="w-full text-accent text-lg font-normal outline-none"
        style={{ fontFamily: '"Motiva Sans", Arial, Helvetica, sans-serif', '--title-placeholder': `'${t('titleEditor.placeholder')}'` } as React.CSSProperties}
        onContextMenu={(event) => {
          if (!editor) return;

          const target = event.target as HTMLElement;
          const imageElement = target?.closest<HTMLElement>("[data-image-node-id]");

          if (imageElement) {
            const imageNodeId = imageElement.dataset.imageNodeId;
            if (imageNodeId) {
              event.preventDefault();

              const coords = editor.view.posAtCoords({
                left: event.clientX,
                top: event.clientY
              });

              // 从节点 attrs 读取当前 preset/alignment（与 TipTapEditor 一致）
              let nodeSizePreset: ImageSizePreset = "original";
              let nodeAlignment: ImageAlignment = "inline";
              let targetPos: number | null = null;

              if (coords?.pos != null) {
                const clickPos = coords.pos;
                editor.state.doc.descendants((node, pos) => {
                  if (node.type.name === "steamImage") {
                    const nodeEnd = pos + node.nodeSize;
                    if (clickPos >= pos && clickPos <= nodeEnd) {
                      nodeSizePreset = (node.attrs.sizePreset as ImageSizePreset) || "original";
                      nodeAlignment = (node.attrs.alignment as ImageAlignment) || "inline";
                      targetPos = pos;
                      return false;
                    }
                  }
                  return true;
                });

                editor
                  .chain()
                  .focus()
                  .setNodeSelection(targetPos ?? clickPos)
                  .run();
              } else {
                editor.commands.focus();
              }

              setContextMenu({
                visible: true,
                x: event.clientX,
                y: event.clientY,
                mode: "image",
                payload: {
                  imageNodeId,
                  pos: targetPos ?? coords?.pos ?? null,
                  sizePreset: nodeSizePreset,
                  alignment: nodeAlignment
                }
              });
              return;
            }
          }
        }}
      >
        <EditorContent editor={editor} />
      </div>

      {/* 字符数统计 */}
      <div
        className="flex justify-end mt-2 text-[0.85rem] font-medium"
        style={{ color: getCharacterCountColor(characterInfo) }}
      >
        {getCharacterCountText(characterInfo)}
      </div>

      {/* 右键菜单 */}
      {contextMenu.visible && contextMenu.mode === "image" && contextMenuImageNode && (
        <div
          ref={contextMenuRef}
          className="fixed bg-bg-overlay border border-border-accent rounded-lg p-1 flex flex-col gap-1 min-w-[160px] z-[9999] shadow-xl"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <MenuSectionLabel label={t('image.size')} />
          {([
            { label: t('image.original'), value: 'original' as ImageSizePreset },
            { label: t('image.half'), value: 'half' as ImageSizePreset },
            { label: t('image.full'), value: 'full' as ImageSizePreset }
          ]).map((option) => (
            <MenuItem
              key={option.value}
              label={option.label}
              active={contextMenuImageNode.display.preset === option.value}
              onClick={() => applyImagePreset(option.value)}
              onComplete={closeContextMenu}
            />
          ))}
          <MenuDivider />
          <MenuSectionLabel label={t('image.align')} />
          {([
            { label: t('image.alignLeft'), value: 'floatLeft' as ImageAlignment },
            { label: t('image.alignRight'), value: 'floatRight' as ImageAlignment },
            { label: t('image.inline'), value: 'inline' as ImageAlignment }
          ]).map((option) => (
            <MenuItem
              key={option.value}
              label={option.label}
              active={contextMenuImageNode.display.alignment === option.value}
              onClick={() => applyImageAlignment(option.value)}
              onComplete={closeContextMenu}
            />
          ))}
          <MenuDivider />
          <MenuItem
            label={t('image.upload')}
            onClick={handleUploadImage}
            onComplete={closeContextMenu}
          />
          <MenuItem
            label={t('image.delete')}
            danger
            onClick={handleDeleteImage}
            onComplete={closeContextMenu}
          />
        </div>
      )}

      {/* 全局样式 */}
      <style>{`
        .title-editor-content {
          outline: none;
          font-family: inherit;
          line-height: normal;
        }

        .title-editor-content p {
          margin: 0;
          padding: 0;
        }

        .title-editor-content p:not(:first-child) {
          margin-top: 0.5rem;
        }

        .title-editor-content .ProseMirror-focused {
          outline: none;
        }

        /* 标题栏中的图片样式 */
        .title-editor-content img {
          max-width: 100%;
          height: auto;
          border-radius: 4px;
          display: block;
          margin: 0.5rem 0;
        }

        /* 单行模式下限制图片高度 */
        .title-editor-content[style*="max-height: 30px"] img {
          max-height: 24px;
          width: auto;
          display: inline-block;
          margin: 0 0.25rem;
          vertical-align: middle;
        }

        /* Steam Image 组件在标题栏中的样式 */
        .title-editor-content .steam-image-container {
          display: inline-block;
          position: relative;
          margin: 0.25rem;
        }

        /* 占位符样式 — 通过 CSS 变量实现 i18n */
        .title-editor-content .ProseMirror p.is-editor-empty:first-child::before {
          content: var(--title-placeholder);
          color: rgba(102, 192, 244, 0.4);
          opacity: 1;
          pointer-events: none;
          position: absolute;
        }
      `}</style>
    </div>
  );
};

export default TitleEditor;
