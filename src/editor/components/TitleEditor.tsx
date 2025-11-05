import React, { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { JSONContent } from '@tiptap/core';
import { createEditorExtensions } from '../utils/editorExtensions';
import { titleHasImage } from '../utils/titleHelpers';

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
          ? 'min-height: 40px; max-height: none;'
          : 'min-height: 40px; max-height: 40px; overflow-y: auto;'
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

  if (!editor) {
    return null;
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      flex: 1,
      width: '100%'
    }}>
      {/* 标题编辑器 */}
      <div
        style={{
          width: '100%',
          border: editor.isFocused
            ? '1px solid #66c0f4'
            : '1px solid rgba(102, 192, 244, 0.3)',
          background: 'rgba(13, 23, 36, 0.6)',
          color: '#d7e8ff',
          fontSize: '1.1rem',
          fontWeight: 600,
          padding: '0.5rem 0.75rem',
          borderRadius: '0.5rem',
          outline: 'none',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          boxShadow: editor.isFocused
            ? '0 0 0 2px rgba(102, 192, 244, 0.2)'
            : 'none'
        }}
      >
        <EditorContent editor={editor} />
      </div>

      {/* 提示信息 */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.75rem', color: '#8aa4c7' }}>
          {hasImage
            ? '已包含图片 • 高度自动调整'
            : '1行高度 • 可拖拽/粘贴图片自动扩展'}
        </span>
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
        .title-editor-content[style*="max-height: 40px"] img {
          max-height: 30px;
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
