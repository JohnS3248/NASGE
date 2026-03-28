import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useGuideStore } from '../stores/useGuideStore';
import { extractTitleText } from '../utils/titleHelpers';
import type { ChapterInfo } from '../stores/useGuideStore';

const DraftPanel: React.FC = () => {
  const {
    drafts,
    activeDraftId,
    selectDraft,
    addDraft,
    updateDraft,
    deleteDraft,
    duplicateDraft,
    // 绑定相关
    mode,
    guideInfo,
    isBindingMode,
    enterBindingMode,
    exitBindingMode,
    unbindDraft,
    // 存档相关
    currentArchiveId,
    getCurrentArchive
  } = useGuideStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentArchive = getCurrentArchive();

  // 过滤草稿：只显示当前存档的草稿（或未关联的草稿，如果没有选中存档）
  const displayedDrafts = useMemo(() => {
    if (!currentArchiveId) {
      return drafts.filter(draft => !draft.linkedGuideId);
    }
    return drafts.filter(draft => draft.linkedGuideId === currentArchiveId);
  }, [drafts, currentArchiveId]);

  const activeDraft = drafts.find((d) => d.id === activeDraftId);

  // 获取当前草稿绑定的章节信息
  const boundChapter = useMemo<ChapterInfo | undefined>(() => {
    if (!activeDraft?.linkedChapterId || !guideInfo?.chapters) return undefined;
    return guideInfo.chapters.find((c) => c.sectionId === activeDraft.linkedChapterId);
  }, [activeDraft?.linkedChapterId, guideInfo?.chapters]);

  // 是否可以绑定（指南模式且有活动草稿）
  const canBind = mode === 'guide' && !!activeDraft;

  const getDraftDisplayTitle = (draft: typeof activeDraft) => {
    if (!draft) return '';
    const titleText = extractTitleText(draft.title);
    if (titleText) return titleText;
    return draft.lastSyncedAt ? '未命名章节' : '本地未命名章节';
  };

  // 点击外部关闭下拉
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, handleClickOutside]);

  return (
    <div
      ref={dropdownRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        position: 'relative'
      }}
    >
      {/* 草稿选择器 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          flex: 1,
          minWidth: 0
        }}
      >
        {/* 下拉触发器 */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.45rem 0.75rem',
            borderRadius: '0.5rem',
            border: '1px solid rgba(102, 192, 244, 0.3)',
            background: 'rgba(8, 14, 23, 0.7)',
            color: 'var(--text-primary, #d7e8ff)',
            cursor: 'pointer',
            fontSize: '0.85rem',
            minWidth: 0,
            maxWidth: '420px'
          }}
        >
          <span style={{
            color: 'var(--text-secondary, #8aa4c7)',
            fontSize: '0.75rem',
            flexShrink: 0
          }}>
            {isOpen ? '\u25BC' : '\u25B6'}
          </span>

          {activeDraft ? (
            <span style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}>
              <span style={{ fontWeight: 500 }}>
                {getDraftDisplayTitle(activeDraft)}
              </span>
              <span style={{
                fontSize: '0.75rem',
                color: 'var(--text-secondary, #8aa4c7)',
                opacity: 0.85
              }}>
                · {activeDraft.draftName}
              </span>
              {boundChapter && (
                <span style={{
                  fontSize: '0.7rem',
                  color: 'var(--color-primary, #66c0f4)',
                  flexShrink: 0
                }}>
                  \u2192 {boundChapter.title}
                </span>
              )}
            </span>
          ) : (
            <span style={{ color: 'var(--text-secondary, #8aa4c7)' }}>
              未选择草稿
            </span>
          )}
        </button>

        {/* 绑定操作 */}
        {canBind && (
          <>
            {isBindingMode ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                <span style={{
                  fontSize: '0.78rem',
                  color: 'var(--color-primary, #66c0f4)',
                  fontWeight: 500,
                  animation: 'pulse 1.5s infinite'
                }}>
                  请在章节列表中选择
                </span>
                <button
                  type="button"
                  onClick={() => exitBindingMode()}
                  style={{
                    padding: '0.25rem 0.55rem',
                    borderRadius: '0.35rem',
                    border: '1px solid rgba(255, 128, 128, 0.5)',
                    background: 'rgba(255, 128, 128, 0.15)',
                    color: '#ff8080',
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontSize: '0.72rem'
                  }}
                >
                  取消
                </button>
              </div>
            ) : boundChapter ? (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('确定要解除绑定吗？解除后需要重新绑定才能上传到 Steam。')) {
                    unbindDraft(activeDraft!.id);
                  }
                }}
                style={{
                  padding: '0.25rem 0.5rem',
                  borderRadius: '0.35rem',
                  border: '1px solid rgba(255, 128, 128, 0.4)',
                  background: 'transparent',
                  color: '#ff8080',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  opacity: 0.8,
                  flexShrink: 0
                }}
              >
                解绑
              </button>
            ) : (
              <button
                type="button"
                onClick={() => enterBindingMode()}
                style={{
                  padding: '0.3rem 0.65rem',
                  borderRadius: '0.35rem',
                  border: '1px solid rgba(102, 192, 244, 0.5)',
                  background: 'rgba(102, 192, 244, 0.15)',
                  color: 'var(--color-primary, #66c0f4)',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                  flexShrink: 0
                }}
              >
                绑定章节
              </button>
            )}
          </>
        )}
      </div>

      {/* 新建按钮 */}
      <button
        type="button"
        onClick={() => addDraft()}
        style={{
          padding: '0.4rem 0.85rem',
          borderRadius: '0.5rem',
          border: 'none',
          background: 'linear-gradient(135deg, rgba(102, 192, 244, 0.95), rgba(66, 139, 202, 0.95))',
          color: '#06101e',
          fontWeight: 600,
          cursor: 'pointer',
          fontSize: '0.8rem',
          flexShrink: 0
        }}
      >
        新建草稿
      </button>

      {/* 下拉浮层 */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            minWidth: '320px',
            maxWidth: '450px',
            maxHeight: '380px',
            overflowY: 'auto',
            background: 'rgba(10, 17, 28, 0.98)',
            border: '1px solid rgba(102, 192, 244, 0.3)',
            borderRadius: '0.6rem',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5)',
            zIndex: 200,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* 草稿列表 */}
          {displayedDrafts.length === 0 ? (
            <div style={{
              padding: '1.2rem 1rem',
              textAlign: 'center',
              color: 'var(--text-secondary, #8aa4c7)',
              fontSize: '0.8rem'
            }}>
              {currentArchive
                ? `"${currentArchive.guideName}" 下没有草稿`
                : '点击「新建草稿」开始编辑'}
            </div>
          ) : (
            <div style={{ padding: '0.35rem 0' }}>
              {displayedDrafts.map((draft) => {
                const isActive = activeDraftId === draft.id;
                const draftBoundChapter = draft.linkedChapterId && guideInfo?.chapters
                  ? guideInfo.chapters.find(c => c.sectionId === draft.linkedChapterId)
                  : undefined;

                return (
                  <button
                    key={draft.id}
                    type="button"
                    onClick={() => {
                      selectDraft(draft.id);
                      setIsOpen(false);
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6rem',
                      padding: '0.55rem 0.85rem',
                      border: 'none',
                      background: isActive ? 'rgba(102, 192, 244, 0.15)' : 'transparent',
                      color: 'var(--text-primary, #d7e8ff)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '0.85rem',
                      transition: 'background 0.1s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'rgba(102, 192, 244, 0.08)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {/* 选中指示器 */}
                    <span style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: isActive ? 'var(--color-primary, #66c0f4)' : 'transparent',
                      border: isActive ? 'none' : '1px solid rgba(102, 192, 244, 0.3)',
                      flexShrink: 0
                    }} />

                    {/* 草稿信息 */}
                    <div style={{
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.15rem'
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem'
                      }}>
                        <span style={{
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {getDraftDisplayTitle(draft)}
                        </span>
                        {draftBoundChapter && (
                          <span style={{
                            fontSize: '0.7rem',
                            color: 'var(--color-primary, #66c0f4)',
                            flexShrink: 0
                          }}>
                            \u2192 {draftBoundChapter.title}
                          </span>
                        )}
                      </div>
                      <span style={{
                        fontSize: '0.72rem',
                        color: 'var(--text-secondary, #8aa4c7)',
                        opacity: 0.8
                      }}>
                        {draft.draftName} · {new Date(draft.updatedAt).toLocaleString('zh-CN', {
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* 操作栏 */}
          {activeDraft && displayedDrafts.length > 0 && (
            <div style={{
              display: 'flex',
              gap: '0',
              borderTop: '1px solid rgba(102, 192, 244, 0.15)'
            }}>
              <button
                type="button"
                onClick={() => {
                  const newName = window.prompt('重命名草稿', activeDraft.draftName);
                  if (newName && newName.trim()) {
                    updateDraft(activeDraft.id, { draftName: newName.trim() });
                  }
                }}
                style={dropdownActionStyle}
              >
                重命名
              </button>
              <button
                type="button"
                onClick={() => {
                  const newDraft = duplicateDraft(activeDraft.id);
                  if (newDraft) {
                    selectDraft(newDraft.id);
                  }
                }}
                style={dropdownActionStyle}
              >
                复制
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`确定要删除草稿"${activeDraft.draftName}"吗？`)) {
                    deleteDraft(activeDraft.id);
                  }
                }}
                style={{
                  ...dropdownActionStyle,
                  color: '#ff8080'
                }}
              >
                删除
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const dropdownActionStyle: React.CSSProperties = {
  flex: 1,
  border: 'none',
  borderRadius: 0,
  padding: '0.5rem 0.6rem',
  background: 'transparent',
  color: 'var(--text-secondary, #8aa4c7)',
  cursor: 'pointer',
  fontSize: '0.78rem',
  transition: 'background 0.1s ease'
};

export default DraftPanel;
