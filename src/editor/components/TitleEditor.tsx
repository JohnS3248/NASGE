import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { JSONContent } from '@tiptap/core';
import { createEditorExtensions } from '../utils/editorExtensions';
import { titleHasImage } from '../utils/titleHelpers';
import { extractFilesFromPaste, extractFilesFromDrop } from '../utils/imageInput';
import { processIncomingImages } from '../services/imageIntake';
import { uploadSingleImage } from '../services/ImageUploadService';
import { useImageStore } from '../stores/useImageStore';
import { useEditorImageNodeStore } from '../stores/useEditorImageNodeStore';
import type { ImageSizePreset, ImageAlignment } from '../types/image';
import { checkCharacterLimit, getCharacterCountColor, getCharacterCountText } from '../utils/characterLimit';
import { TITLE_CHARACTER_LIMIT } from '../constants/limits';
import { loggers } from '../../shared/logger';

// 类型别名，保持向后兼容
type ImageDisplayPreset = ImageSizePreset;

interface TitleEditorProps {
  value: JSONContent;
  onChange: (newValue: JSONContent) => void;
}

type ImageContextPayload = {
  imageNodeId: string;
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
  // 检测标题中是否包含图片
  const [hasImage, setHasImage] = useState(false);
  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(INITIAL_CONTEXT_MENU);
  // 字符数限制信息
  const [characterInfo, setCharacterInfo] = useState(() => ({
    length: 0,
    remaining: TITLE_CHARACTER_LIMIT,
    exceeded: false,
    warning: false,
    limit: TITLE_CHARACTER_LIMIT
  }));
  // === 图片节点存储 (新 Store 优先，旧 Store 兜底) ===
  // 新 Store 方法
  const updateImageDisplayNew = useImageStore((state) => state.updateDisplay);
  const removeImageNew = useImageStore((state) => state.removeImage);
  // 旧 Store 方法（双写）
  const updateImageDisplayLegacy = useEditorImageNodeStore((state) => state.updateDisplay);
  const removeImageNodeLegacy = useEditorImageNodeStore((state) => state.removeNode);
  const imageNodesLegacy = useEditorImageNodeStore((state) => state.nodes);
  const imageEntities = useImageStore((state) => state.images);

  // 合并的更新方法
  const updateImageDisplay = useCallback(
    (nodeId: string, patch: Partial<{ preset: ImageDisplayPreset; alignment: ImageAlignment; customWidthPx?: number }>) => {
      const imageEntity = useImageStore.getState().getImageBySourceNodeId(nodeId);
      if (imageEntity) {
        updateImageDisplayNew(imageEntity.id, patch);
      }
      updateImageDisplayLegacy(nodeId, patch);
    },
    [updateImageDisplayNew, updateImageDisplayLegacy]
  );

  // 合并的删除方法
  const removeImageNode = useCallback(
    (nodeId: string) => {
      const imageEntity = useImageStore.getState().getImageBySourceNodeId(nodeId);
      if (imageEntity) {
        removeImageNew(imageEntity.id);
      }
      removeImageNodeLegacy(nodeId);
    },
    [removeImageNew, removeImageNodeLegacy]
  );

  // 合并的 imageNodes（兼容旧代码）
  const imageNodes = imageNodesLegacy;

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

  // 获取当前右键菜单对应的图片节点
  const contextMenuImageNode = contextMenu.mode === "image" && contextMenu.payload?.imageNodeId
    ? imageNodes[contextMenu.payload.imageNodeId]
    : undefined;

  // 应用图片尺寸预设
  const applyImagePreset = useCallback((preset: ImageDisplayPreset) => {
    if (!contextMenu.payload?.imageNodeId) return;
    updateImageDisplay(contextMenu.payload.imageNodeId, { preset });
  }, [contextMenu.payload?.imageNodeId, updateImageDisplay]);

  // 应用图片对齐方式
  const applyImageAlignment = useCallback((alignment: ImageAlignment) => {
    if (!contextMenu.payload?.imageNodeId) return;
    updateImageDisplay(contextMenu.payload.imageNodeId, { alignment });
  }, [contextMenu.payload?.imageNodeId, updateImageDisplay]);

  // 删除图片
  const handleDeleteImage = useCallback(() => {
    if (!editor || contextMenu.mode !== "image" || !contextMenu.payload?.imageNodeId) {
      return;
    }

    const nodeId = contextMenu.payload.imageNodeId;
    editor.commands.focus();
    editor.chain().focus().deleteSelection().run();
    removeImageNode(nodeId);
  }, [contextMenu, editor, removeImageNode]);

  // 上传图片
  const handleUploadImage = useCallback(async () => {
    if (!contextMenu.payload?.imageNodeId) {
      return;
    }

    try {
      await uploadSingleImage(contextMenu.payload.imageNodeId);
      loggers.image.info('TitleEditor 图片上传成功');
    } catch (error) {
      loggers.image.error('TitleEditor 图片上传失败:', error);
      window.alert(`图片上传失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }, [contextMenu.payload?.imageNodeId]);

  // 处理拖拽/粘贴的图片
  const handleIncomingFiles = useCallback(
    async (files: File[], source: 'paste' | 'drop') => {
      if (!editor || !files.length) return;
      const cursorPosition = editor.state.selection.anchor;

      try {
        await processIncomingImages(editor, files, {
          source,
          cursorPosition
        });
      } catch (error) {
        loggers.image.error('TitleEditor 处理图片失败:', error);
      }
    },
    [editor]
  );

  // 添加粘贴和拖拽事件监听器
  useEffect(() => {
    if (!editor) return;

    const dom = editor.view.dom;

    const onPaste = (event: ClipboardEvent) => {
      const files = extractFilesFromPaste(event);
      if (!files.length) return;
      event.preventDefault();
      event.stopPropagation();
      editor.commands.focus();
      void handleIncomingFiles(files, 'paste');
    };

    const onDrop = (event: DragEvent) => {
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

      void handleIncomingFiles(files, 'drop');
    };

    const onDragOver = (event: DragEvent) => {
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
  }, [editor, handleIncomingFiles]);

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
    <div style={{
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-input, rgba(9, 15, 25, 0.55))',
      border: '1px solid var(--border-accent, rgba(102, 192, 244, 0.25))',
      borderRadius: '1rem',
      padding: '1.25rem',
      boxShadow: '0 18px 30px rgba(7, 11, 19, 0.45)'
    }}>
      {/* 标题编辑器内容区 */}
      <div
        style={{
          width: '100%',
          color: 'var(--text-primary, #d7e8ff)',
          fontSize: '1.1rem',
          fontWeight: 600,
          outline: 'none'
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          if (!editor) {
            loggers.editor.verbose('TitleEditor onContextMenu: editor not ready');
            return;
          }

          const target = event.target as HTMLElement;
          loggers.editor.verbose('TitleEditor onContextMenu triggered', {
            target: target.tagName,
            targetClass: target.className
          });

          // 检查是否点击了图片容器
          const imageContainer = target.classList.contains('nasge-image-node')
            ? target
            : target.closest<HTMLElement>('.nasge-image-node');

          if (imageContainer) {
            // 直接从 DOM 属性获取 imageNodeId
            const imageNodeId = imageContainer.dataset.imageNodeId;
            loggers.editor.verbose('TitleEditor Found image container, imageNodeId from DOM:', imageNodeId);

            if (imageNodeId) {
              // 获取点击坐标
              const coords = editor.view.posAtCoords({
                left: event.clientX,
                top: event.clientY
              });

              loggers.editor.verbose('TitleEditor Click coords:', coords);

              // 遍历文档查找匹配的 steamImage 节点
              let foundPos: number | null = null;
              editor.state.doc.descendants((node, pos) => {
                if (node.type.name === 'steamImage' && node.attrs.imageNodeId === imageNodeId) {
                  foundPos = pos;
                  return false; // 停止遍历
                }
              });

              if (foundPos !== null) {
                loggers.editor.verbose('TitleEditor Found steamImage node at position:', foundPos);

                // 选中该节点
                editor
                  .chain()
                  .focus()
                  .setNodeSelection(foundPos)
                  .run();

                setContextMenu({
                  visible: true,
                  x: event.clientX,
                  y: event.clientY,
                  mode: "image",
                  payload: { imageNodeId }
                });
                return;
              } else {
                loggers.editor.warn('TitleEditor steamImage node not found in document for imageNodeId:', imageNodeId);
              }
            } else {
              loggers.editor.warn('TitleEditor Container found but no imageNodeId in dataset');
            }
          }

          loggers.editor.verbose('TitleEditor No valid image node found');
        }}
      >
        <EditorContent editor={editor} />
      </div>

      {/* 字符数统计 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginTop: '0.5rem',
          fontSize: '0.85rem',
          fontWeight: 500,
          color: getCharacterCountColor(characterInfo)
        }}
      >
        {getCharacterCountText(characterInfo)}
      </div>

      {/* 右键菜单 */}
      {contextMenu.visible && contextMenu.mode === "image" && contextMenuImageNode && (
        <div
          style={{
            position: "fixed",
            top: contextMenu.y,
            left: contextMenu.x,
            background: "var(--bg-toolbar, rgba(15, 26, 41, 0.95))",
            border: "1px solid var(--border-accent, rgba(102, 192, 244, 0.25))",
            borderRadius: "var(--radius-md, 0.75rem)",
            padding: "0.35rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem",
            minWidth: "160px",
            zIndex: 9999,
            boxShadow: "0 16px 38px rgba(6, 12, 20, 0.55)"
          }}
        >
          <MenuSectionLabel label="尺寸" />
          {IMAGE_SIZE_OPTIONS.map((option) => (
            <MenuItem
              key={option.value}
              label={option.label}
              active={contextMenuImageNode.display.preset === option.value}
              onClick={() => applyImagePreset(option.value)}
              onComplete={closeContextMenu}
            />
          ))}
          <MenuDivider />
          <MenuSectionLabel label="对齐" />
          {IMAGE_ALIGNMENT_OPTIONS.map((option) => (
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
            label="上传图片"
            onClick={handleUploadImage}
            onComplete={closeContextMenu}
          />
          <MenuItem
            label="删除图片"
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
          line-height: 1.5;
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

        /* 占位符样式 */
        .title-editor-content .ProseMirror p.is-editor-empty:first-child::before {
          content: '章节标题（支持拖拽/粘贴图片）';
          color: var(--text-secondary, #8aa4c7);
          opacity: 0.5;
          pointer-events: none;
          position: absolute;
        }
      `}</style>
    </div>
  );
};

// ===== 菜单组件 =====

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
      color: danger ? "#ff8f8f" : disabled ? "rgba(205, 226, 255, 0.45)" : active ? "var(--text-bright, #e3edf9)" : "var(--text-primary, #d7e8ff)",
      borderRadius: "var(--radius-sm, 0.6rem)",
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
      background: "var(--border-input, rgba(102, 192, 244, 0.18))"
    }}
  />
);

export default TitleEditor;
