/**
 * 标签管理弹窗组件
 * 支持创建、重命名、删除、调色
 */
import React, { useState, useRef, useEffect } from "react";
import { useGuideStore, TAG_COLORS, ImageTag } from "../../stores/useGuideStore";
import { COLORS, SIZES } from "./styles";

interface TagManagerProps {
  visible: boolean;
  onClose: () => void;
}

const TagManager: React.FC<TagManagerProps> = ({ visible, onClose }) => {
  const {
    currentArchiveId,
    getCurrentArchive,
    createTag,
    updateTag,
    deleteTag
  } = useGuideStore();

  const archive = getCurrentArchive();
  const tags = archive?.imageTags || [];

  // 新建标签状态
  const [isCreating, setIsCreating] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const newTagInputRef = useRef<HTMLInputElement>(null);

  // 编辑标签状态
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  // 颜色选择器状态
  const [colorPickerTagId, setColorPickerTagId] = useState<string | null>(null);

  // 删除确认状态
  const [deletingTagId, setDeletingTagId] = useState<string | null>(null);

  // 聚焦新建输入框
  useEffect(() => {
    if (isCreating && newTagInputRef.current) {
      newTagInputRef.current.focus();
    }
  }, [isCreating]);

  // 聚焦编辑输入框
  useEffect(() => {
    if (editingTagId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTagId]);

  if (!visible || !currentArchiveId) return null;

  // 创建标签
  const handleCreate = () => {
    if (!newTagName.trim()) return;
    createTag(currentArchiveId, newTagName.trim());
    setNewTagName("");
    setIsCreating(false);
  };

  // 开始编辑
  const startEditing = (tag: ImageTag) => {
    setEditingTagId(tag.id);
    setEditingName(tag.name);
  };

  // 保存编辑
  const saveEditing = () => {
    if (!editingTagId || !editingName.trim()) {
      setEditingTagId(null);
      return;
    }
    updateTag(currentArchiveId, editingTagId, { name: editingName.trim() });
    setEditingTagId(null);
  };

  // 更改颜色
  const handleColorChange = (tagId: string, color: string) => {
    updateTag(currentArchiveId, tagId, { color });
    setColorPickerTagId(null);
  };

  // 删除标签
  const handleDelete = (tagId: string) => {
    deleteTag(currentArchiveId, tagId);
    setDeletingTagId(null);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 420,
          maxHeight: "80vh",
          background: COLORS.panelBg,
          border: `1px solid ${COLORS.border}`,
          borderRadius: SIZES.borderRadius,
          boxShadow: `0 8px 32px ${COLORS.shadow}`,
          display: "flex",
          flexDirection: "column"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: `1px solid ${COLORS.border}`
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.textPrimary }}>
            管理标签
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 24,
              height: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: "transparent",
              color: COLORS.textMuted,
              cursor: "pointer",
              borderRadius: 4,
              fontSize: 16
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(199, 69, 69, 0.2)";
              e.currentTarget.style.color = COLORS.error;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = COLORS.textMuted;
            }}
          >
            ×
          </button>
        </div>

        {/* 标签列表 */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "8px 0"
          }}
        >
          {tags.length === 0 && !isCreating ? (
            <div
              style={{
                padding: "24px 16px",
                textAlign: "center",
                color: COLORS.textMuted,
                fontSize: 13
              }}
            >
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
            <div style={{ padding: "8px 16px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  background: COLORS.accentDark,
                  borderRadius: 6,
                  border: `1px solid ${COLORS.accent}`
                }}
              >
                <input
                  ref={newTagInputRef}
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") {
                      setIsCreating(false);
                      setNewTagName("");
                    }
                  }}
                  placeholder="输入标签名称"
                  style={{
                    flex: 1,
                    border: "none",
                    background: "transparent",
                    color: COLORS.textPrimary,
                    fontSize: 13,
                    outline: "none"
                  }}
                />
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!newTagName.trim()}
                  style={{
                    padding: "4px 12px",
                    border: "none",
                    borderRadius: 4,
                    background: newTagName.trim() ? COLORS.accent : COLORS.textMuted,
                    color: "#fff",
                    fontSize: 12,
                    cursor: newTagName.trim() ? "pointer" : "not-allowed"
                  }}
                >
                  创建
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false);
                    setNewTagName("");
                  }}
                  style={{
                    padding: "4px 8px",
                    border: "none",
                    borderRadius: 4,
                    background: "transparent",
                    color: COLORS.textMuted,
                    fontSize: 12,
                    cursor: "pointer"
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div
          style={{
            padding: "12px 16px",
            borderTop: `1px solid ${COLORS.border}`
          }}
        >
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            disabled={isCreating}
            style={{
              width: "100%",
              padding: "8px 16px",
              border: `1px dashed ${isCreating ? COLORS.textMuted : COLORS.accent}`,
              borderRadius: 6,
              background: "transparent",
              color: isCreating ? COLORS.textMuted : COLORS.accent,
              fontSize: 13,
              cursor: isCreating ? "not-allowed" : "pointer",
              transition: "all 0.15s ease"
            }}
            onMouseEnter={(e) => {
              if (!isCreating) {
                e.currentTarget.style.background = COLORS.accentDark;
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            + 新建标签
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
      <div
        style={{
          padding: "8px 16px"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 12px",
            background: "rgba(199, 69, 69, 0.15)",
            borderRadius: 6,
            border: `1px solid ${COLORS.error}`
          }}
        >
          <span style={{ fontSize: 12, color: COLORS.textPrimary }}>
            确定删除标签 "{tag.name}"?
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={onConfirmDelete}
              style={{
                padding: "4px 12px",
                border: "none",
                borderRadius: 4,
                background: COLORS.error,
                color: "#fff",
                fontSize: 12,
                cursor: "pointer"
              }}
            >
              删除
            </button>
            <button
              type="button"
              onClick={onCancelDelete}
              style={{
                padding: "4px 8px",
                border: "none",
                borderRadius: 4,
                background: "transparent",
                color: COLORS.textMuted,
                fontSize: 12,
                cursor: "pointer"
              }}
            >
              取消
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "4px 16px"
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderRadius: 6,
          transition: "background 0.15s ease"
        }}
        onMouseEnter={(e) => {
          if (!isEditing) {
            e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
          }
        }}
        onMouseLeave={(e) => {
          if (!isEditing) {
            e.currentTarget.style.background = "transparent";
          }
        }}
      >
        {/* 颜色选择器触发 */}
        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={onToggleColorPicker}
            style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              border: `2px solid ${tag.color}`,
              background: tag.color,
              cursor: "pointer",
              padding: 0
            }}
            title="更改颜色"
          />

          {/* 颜色选择器弹出 */}
          {showColorPicker && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                marginTop: 4,
                padding: 10,
                background: COLORS.panelBg,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 8,
                boxShadow: `0 4px 12px ${COLORS.shadow}`,
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: 6,
                zIndex: 10
              }}
            >
              {TAG_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => onColorChange(color)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    border: color === tag.color ? "3px solid #fff" : "2px solid transparent",
                    background: color,
                    cursor: "pointer",
                    padding: 0,
                    transition: "transform 0.1s ease"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "scale(1.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
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
            style={{
              flex: 1,
              padding: "4px 8px",
              border: `1px solid ${COLORS.accent}`,
              borderRadius: 4,
              background: "rgba(102, 192, 244, 0.1)",
              color: COLORS.textPrimary,
              fontSize: 13,
              outline: "none"
            }}
          />
        ) : (
          <span
            style={{
              flex: 1,
              fontSize: 13,
              color: COLORS.textPrimary,
              cursor: "pointer"
            }}
            onClick={onStartEdit}
            title="点击编辑"
          >
            {tag.name}
          </span>
        )}

        {/* 操作按钮 */}
        {!isEditing && (
          <div style={{ display: "flex", gap: 4 }}>
            <button
              type="button"
              onClick={onStartEdit}
              style={{
                width: 24,
                height: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "none",
                background: "transparent",
                color: COLORS.textMuted,
                cursor: "pointer",
                borderRadius: 4,
                fontSize: 12
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = COLORS.accentDark;
                e.currentTarget.style.color = COLORS.accent;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = COLORS.textMuted;
              }}
              title="重命名"
            >
              ✏
            </button>
            <button
              type="button"
              onClick={onStartDelete}
              style={{
                width: 24,
                height: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "none",
                background: "transparent",
                color: COLORS.textMuted,
                cursor: "pointer",
                borderRadius: 4,
                fontSize: 12
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(199, 69, 69, 0.2)";
                e.currentTarget.style.color = COLORS.error;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = COLORS.textMuted;
              }}
              title="删除"
            >
              🗑
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TagManager;
