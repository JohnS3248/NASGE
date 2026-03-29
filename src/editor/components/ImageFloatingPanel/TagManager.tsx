/**
 * 标签管理弹窗组件
 * 支持创建、重命名、删除、调色
 */
import React, { useState, useRef, useEffect } from "react";
import { useGuideStore, TAG_COLORS, type ImageTag } from "../../stores/useGuideStore";
import { useArchiveStore } from "../../stores/useArchiveStore";
import { PencilIcon, TrashIcon, XIcon, PlusIcon } from "./icons";

interface TagManagerProps {
  visible: boolean;
  onClose: () => void;
}

const TagManager: React.FC<TagManagerProps> = ({ visible, onClose }) => {
  const currentArchiveId = useGuideStore((s) => s.currentArchiveId);
  const { createTag, updateTag, deleteTag } = useArchiveStore();
  const archive = useArchiveStore((s) => currentArchiveId ? s.archives[currentArchiveId] : undefined);
  const tags = archive?.imageTags || [];

  const [isCreating, setIsCreating] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const newTagInputRef = useRef<HTMLInputElement>(null);

  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  const [colorPickerTagId, setColorPickerTagId] = useState<string | null>(null);
  const [deletingTagId, setDeletingTagId] = useState<string | null>(null);

  useEffect(() => {
    if (isCreating && newTagInputRef.current) {
      newTagInputRef.current.focus();
    }
  }, [isCreating]);

  useEffect(() => {
    if (editingTagId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTagId]);

  if (!visible || !currentArchiveId) return null;

  const handleCreate = () => {
    if (!newTagName.trim()) return;
    createTag(currentArchiveId, newTagName.trim());
    setNewTagName("");
    setIsCreating(false);
  };

  const startEditing = (tag: ImageTag) => {
    setEditingTagId(tag.id);
    setEditingName(tag.name);
  };

  const saveEditing = () => {
    if (!editingTagId || !editingName.trim()) {
      setEditingTagId(null);
      return;
    }
    updateTag(currentArchiveId, editingTagId, { name: editingName.trim() });
    setEditingTagId(null);
  };

  const handleColorChange = (tagId: string, color: string) => {
    updateTag(currentArchiveId, tagId, { color });
    setColorPickerTagId(null);
  };

  const handleDelete = (tagId: string) => {
    deleteTag(currentArchiveId, tagId);
    setDeletingTagId(null);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000]"
      onClick={onClose}
    >
      <div
        className="w-[420px] max-h-[80vh] bg-[rgba(13,23,36,0.95)] border border-border-accent rounded-md shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-accent">
          <span className="text-sm font-semibold text-text-primary">
            管理标签
          </span>
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center border-none bg-transparent text-text-muted cursor-pointer rounded-sm hover:bg-danger/20 hover:text-danger"
          >
            <XIcon size={16} />
          </button>
        </div>

        {/* 标签列表 */}
        <div className="flex-1 overflow-y-auto py-2">
          {tags.length === 0 && !isCreating ? (
            <div className="px-4 py-6 text-center text-text-muted text-[13px]">
              暂无标签，点击下方按钮创建
            </div>
          ) : (
            tags.map((tag) => (
              <TagItem
                key={tag.id}
                tag={tag}
                isEditing={editingTagId === tag.id}
                editingName={editingName}
                isDeleting={deletingTagId === tag.id}
                showColorPicker={colorPickerTagId === tag.id}
                onEditingNameChange={setEditingName}
                onStartEdit={() => startEditing(tag)}
                onSaveEdit={saveEditing}
                onCancelEdit={() => setEditingTagId(null)}
                onToggleColorPicker={() => setColorPickerTagId(colorPickerTagId === tag.id ? null : tag.id)}
                onColorChange={(color) => handleColorChange(tag.id, color)}
                onStartDelete={() => setDeletingTagId(tag.id)}
                onConfirmDelete={() => handleDelete(tag.id)}
                onCancelDelete={() => setDeletingTagId(null)}
                editInputRef={editInputRef}
              />
            ))
          )}

          {/* 新建标签输入 */}
          {isCreating && (
            <div className="px-4 py-2">
              <div className="flex items-center gap-2 px-3 py-2 bg-accent-subtle rounded-md border border-accent">
                <input
                  ref={newTagInputRef}
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") { setIsCreating(false); setNewTagName(""); }
                  }}
                  placeholder="输入标签名称"
                  className="flex-1 border-none bg-transparent text-text-primary text-[13px] outline-none"
                />
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!newTagName.trim()}
                  className={`px-3 py-1 border-none rounded-sm text-white text-xs cursor-pointer ${
                    newTagName.trim() ? "bg-accent" : "bg-text-muted cursor-not-allowed"
                  }`}
                >
                  创建
                </button>
                <button
                  type="button"
                  onClick={() => { setIsCreating(false); setNewTagName(""); }}
                  className="px-2 py-1 border-none rounded-sm bg-transparent text-text-muted text-xs cursor-pointer"
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="px-4 py-3 border-t border-border-accent">
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            disabled={isCreating}
            className={`w-full px-4 py-2 rounded-md text-[13px] transition-all duration-150 ease-out ${
              isCreating
                ? "border border-dashed border-text-muted text-text-muted bg-transparent cursor-not-allowed"
                : "border border-dashed border-accent text-accent bg-transparent cursor-pointer hover:bg-accent-subtle"
            }`}
          >
            <span className="inline-flex items-center gap-1">
              <PlusIcon size={14} /> 新建标签
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

// ============ 标签项组件 ============

interface TagItemProps {
  tag: ImageTag;
  isEditing: boolean;
  editingName: string;
  isDeleting: boolean;
  showColorPicker: boolean;
  onEditingNameChange: (name: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onToggleColorPicker: () => void;
  onColorChange: (color: string) => void;
  onStartDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  editInputRef: React.RefObject<HTMLInputElement | null>;
}

const TagItem: React.FC<TagItemProps> = ({
  tag,
  isEditing,
  editingName,
  isDeleting,
  showColorPicker,
  onEditingNameChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onToggleColorPicker,
  onColorChange,
  onStartDelete,
  onConfirmDelete,
  onCancelDelete,
  editInputRef
}) => {
  // 删除确认状态
  if (isDeleting) {
    return (
      <div className="px-4 py-2">
        <div className="flex items-center justify-between px-3 py-2 bg-danger/15 rounded-md border border-danger">
          <span className="text-xs text-text-primary">
            确定删除标签 &ldquo;{tag.name}&rdquo;?
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onConfirmDelete}
              className="px-3 py-1 border-none rounded-sm bg-danger text-white text-xs cursor-pointer"
            >
              删除
            </button>
            <button
              type="button"
              onClick={onCancelDelete}
              className="px-2 py-1 border-none rounded-sm bg-transparent text-text-muted text-xs cursor-pointer"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-1">
      <div className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors duration-150 ${
        isEditing ? "" : "hover:bg-white/5"
      }`}>
        {/* 颜色选择器触发 */}
        <div className="relative">
          <button
            type="button"
            onClick={onToggleColorPicker}
            className="w-5 h-5 rounded-sm border-2 cursor-pointer p-0"
            style={{ borderColor: tag.color, background: tag.color }}
            title="更改颜色"
          />

          {/* 颜色选择器弹出 */}
          {showColorPicker && (
            <div className="absolute top-full left-0 mt-1 p-2.5 bg-[rgba(13,23,36,0.95)] border border-border-accent rounded-md shadow-lg grid grid-cols-5 gap-1.5 z-10">
              {TAG_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => onColorChange(color)}
                  className="w-8 h-8 rounded-md cursor-pointer p-0 transition-transform duration-100 ease-out hover:scale-110"
                  style={{
                    background: color,
                    border: color === tag.color ? "3px solid #fff" : "2px solid transparent"
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* 标签名 / 编辑输入框 */}
        {isEditing ? (
          <input
            ref={editInputRef}
            type="text"
            value={editingName}
            onChange={(e) => onEditingNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSaveEdit();
              if (e.key === "Escape") onCancelEdit();
            }}
            onBlur={onSaveEdit}
            className="flex-1 px-2 py-1 border border-accent rounded-sm bg-accent/10 text-text-primary text-[13px] outline-none"
          />
        ) : (
          <span
            className="flex-1 text-[13px] text-text-primary cursor-pointer"
            onClick={onStartEdit}
            title="点击编辑"
          >
            {tag.name}
          </span>
        )}

        {/* 操作按钮 */}
        {!isEditing && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onStartEdit}
              className="w-6 h-6 flex items-center justify-center border-none bg-transparent text-text-muted cursor-pointer rounded-sm hover:bg-accent-subtle hover:text-accent"
              title="重命名"
            >
              <PencilIcon size={12} />
            </button>
            <button
              type="button"
              onClick={onStartDelete}
              className="w-6 h-6 flex items-center justify-center border-none bg-transparent text-text-muted cursor-pointer rounded-sm hover:bg-danger/20 hover:text-danger"
              title="删除"
            >
              <TrashIcon size={12} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TagManager;
