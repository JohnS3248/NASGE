import React, { useCallback, useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { JSONContent } from '@tiptap/core';
import { createEditorExtensions } from '../utils/editorExtensions';
import { titleHasImage } from '../utils/titleHelpers';
import { extractFilesFromPaste, extractFilesFromDrop } from '../utils/imageInput';
import { processIncomingImages } from '../services/imageIntake';

interface TitleEditorProps {
  value: JSONContent;
  onChange: (newValue: JSONContent) => void;
}

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
  // 创建 TipTap 编辑器实例
  const editor = useEditor({
    extensions: createEditorExtensions(),
    content: value,
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      onChange(json);
      // 检测内容中是否有图片
      setHasImage(titleHasImage(json));
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
    }
  }, [editor, value]);

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
        console.error('[NASGE TitleEditor] 处理图片失败:', error);
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

  if (!editor) {
    return null;
  }

  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      background: 'rgba(9, 15, 25, 0.55)',
      border: '1px solid rgba(102, 192, 244, 0.25)',
      borderRadius: '1rem',
      padding: '1.25rem',
      boxShadow: '0 18px 30px rgba(7, 11, 19, 0.45)'
    }}>
      {/* 标题编辑器内容区 */}
      <div
        style={{
          width: '100%',
          color: '#d7e8ff',
          fontSize: '1.1rem',
          fontWeight: 600,
          outline: 'none'
        }}
      >
        <EditorContent editor={editor} />
      </div>

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
          color: #8aa4c7;
          opacity: 0.5;
          pointer-events: none;
          position: absolute;
        }
      `}</style>
    </div>
  );
};

export default TitleEditor;
