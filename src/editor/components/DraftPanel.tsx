import React, { useState, useMemo } from 'react';
import { useGuideStore } from '../stores/useGuideStore';
import { extractTitleText } from '../utils/titleHelpers';
import type { ChapterInfo } from '../stores/useGuideStore';
import { loggers } from '../../shared/logger';

const DraftPanel: React.FC = () => {
  const {
    drafts,
    activeDraftId,
    selectDraft,
    addDraft,
    updateDraft,
    deleteDraft,
    duplicateDraft,
    reorderDrafts,
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
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [isDraggable, setIsDraggable] = useState<{ [key: string]: boolean }>({});
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);

  const currentArchive = getCurrentArchive();

  // 过滤草稿：只显示当前存档的草稿（或未关联的草稿，如果没有选中存档）
  const displayedDrafts = useMemo(() => {
    if (!currentArchiveId) {
      // 没有选中存档时，显示未关联的草稿
      return drafts.filter(draft => !draft.linkedGuideId);
    }
    // 有选中存档时，显示关联到当前存档的草稿
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

  /**
   * 获取草稿显示标题
   * - 有内容的标题：显示标题内容
   * - 从Steam拉取的章节（有lastSyncedAt）但标题为空：显示 "未命名章节"
   * - 本地草稿（无lastSyncedAt）标题为空：显示 "本地未命名章节"
   */
  const getDraftDisplayTitle = (draft: typeof activeDraft) => {
    if (!draft) return '';
    const titleText = extractTitleText(draft.title);
    if (titleText) return titleText;
    // 没有标题时，根据是否是从Steam拉取的来区分显示
    // lastSyncedAt 表示曾从Steam同步过，即为拉取的章节
    return draft.lastSyncedAt ? '未命名章节' : '本地未命名章节';
  };

  // 鼠标按下开始计时（长按检测）
  const handleMouseDown = (draftId: string) => {
    loggers.editor.verbose('mouseDown:', draftId);

    const timer = setTimeout(() => {
      // 长按 500ms 后启用拖拽
      setIsDraggable({ [draftId]: true });
      // 添加视觉反馈
      loggers.editor.verbose('长按触发，启用拖拽模式');
    }, 500);

    setLongPressTimer(timer);
  };

  // 鼠标抬起时清除计时器
  const handleMouseUp = () => {
    loggers.editor.verbose('mouseUp');

    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  // 点击事件（只在未拖拽时触发）
  const handleClick = (draftId: string) => {
    loggers.editor.verbose('click:', draftId, 'isDraggable:', isDraggable[draftId]);

    // 如果当前是拖拽模式，不触发点击
    if (isDraggable[draftId]) {
      loggers.editor.verbose('忽略点击（拖拽模式）');
      setIsDraggable({});
      return;
    }

    loggers.editor.verbose('切换草稿');
    selectDraft(draftId);
  };

  const handleDragStart = (e: React.DragEvent, draftId: string) => {
    loggers.editor.verbose('dragStart 触发', { draftId, isDraggable: isDraggable[draftId] });

    // 只有在启用拖拽模式时才允许拖拽
    if (!isDraggable[draftId]) {
      loggers.editor.verbose('阻止拖拽：未启用拖拽模式');
      e.preventDefault();
      return;
    }

    loggers.editor.verbose('开始拖拽');
    setDraggedId(draftId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draftId);
  };

  const handleDragOver = (e: React.DragEvent, draftId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedId && draggedId !== draftId) {
      setDragOverId(draftId);
    }
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    const draggedIndex = drafts.findIndex(d => d.id === draggedId);
    const targetIndex = drafts.findIndex(d => d.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newOrder = [...drafts];
    const [removed] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, removed);

    reorderDrafts(newOrder.map(d => d.id));
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    loggers.editor.verbose('拖拽结束');
    setDraggedId(null);
    setDragOverId(null);
    // 延迟重置拖拽状态，避免影响 click 事件
    setTimeout(() => {
      setIsDraggable({});
    }, 100);
  };

  return (
    <section
      style={{
        borderRadius: '1.05rem',
        background: 'rgba(13, 23, 36, 0.9)',
        border: '1px solid rgba(102, 192, 244, 0.25)',
        padding: '1rem 1.4rem',
        boxShadow: '0 24px 40px rgba(10, 18, 30, 0.45)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem'
      }}
    >
      {/* 折叠头部 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.5rem',
          borderRadius: '0.6rem',
          background: 'rgba(8, 14, 23, 0.6)',
          cursor: 'pointer'
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flex: 1 }}>
          <span style={{ fontSize: '0.9rem', color: '#d7e8ff', fontWeight: 600 }}>
            {isOpen ? '▼' : '▶'} 草稿管理
          </span>
          {activeDraft && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.15rem',
              fontSize: '0.8rem'
            }}>
              {/* 第一行：标题 + 绑定信息 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: '#d7e8ff', fontWeight: 500 }}>
                  {getDraftDisplayTitle(activeDraft)}
                </span>
                {boundChapter && (
                  <span style={{
                    fontSize: '0.75rem',
                    color: '#66c0f4',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}>
                    🔗 {boundChapter.title}
                  </span>
                )}
              </div>
              {/* 第二行：备注名 */}
              <span style={{ fontSize: '0.75rem', color: '#8aa4c7', opacity: 0.85 }}>
                {activeDraft.draftName}
              </span>
            </div>
          )}
          {!activeDraft && (
            <span style={{ fontSize: '0.85rem', color: '#8aa4c7' }}>
              当前: 未选择
            </span>
          )}

          {/* 绑定操作按钮 - 放在右侧 */}
          {canBind && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto', marginRight: '0.8rem' }}>
              {isBindingMode ? (
                // 绑定模式：显示提示和取消按钮
                <>
                  <span style={{
                    fontSize: '0.8rem',
                    color: '#66c0f4',
                    fontWeight: 500,
                    animation: 'pulse 1.5s infinite'
                  }}>
                    ⚡ 请在右侧章节列表中选择
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      exitBindingMode();
                    }}
                    style={{
                      padding: '0.3rem 0.7rem',
                      borderRadius: '0.4rem',
                      border: '1px solid rgba(255, 128, 128, 0.5)',
                      background: 'rgba(255, 128, 128, 0.15)',
                      color: '#ff8080',
                      fontWeight: 500,
                      cursor: 'pointer',
                      fontSize: '0.75rem'
                    }}
                  >
                    取消
                  </button>
                </>
              ) : boundChapter ? (
                // 已绑定：只显示解绑按钮（绑定信息已移到左侧）
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm('确定要解除绑定吗？解除后需要重新绑定才能上传到 Steam。')) {
                      unbindDraft(activeDraft.id);
                    }
                  }}
                  style={{
                    padding: '0.3rem 0.6rem',
                    borderRadius: '0.4rem',
                    border: '1px solid rgba(255, 128, 128, 0.4)',
                    background: 'transparent',
                    color: '#ff8080',
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontSize: '0.7rem',
                    opacity: 0.8
                  }}
                >
                  解绑
                </button>
              ) : (
                // 未绑定：显示绑定按钮
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    enterBindingMode();
                  }}
                  style={{
                    padding: '0.35rem 0.8rem',
                    borderRadius: '0.4rem',
                    border: '1px solid rgba(102, 192, 244, 0.5)',
                    background: 'rgba(102, 192, 244, 0.15)',
                    color: '#66c0f4',
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontSize: '0.8rem'
                  }}
                >
                  绑定章节
                </button>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            addDraft();
          }}
          style={{
            padding: '0.4rem 0.9rem',
            borderRadius: '0.5rem',
            border: 'none',
            background: 'linear-gradient(135deg, rgba(102, 192, 244, 0.95), rgba(66, 139, 202, 0.95))',
            color: '#06101e',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '0.8rem'
          }}
        >
          新建草稿
        </button>
      </div>

      {/* 展开内容 */}
      {isOpen && (
        <div
          style={{
            padding: '0.8rem',
            borderRadius: '0.7rem',
            background: 'rgba(8, 14, 23, 0.85)',
            border: '1px solid rgba(102, 192, 244, 0.18)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.6rem'
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '0.6rem',
              maxHeight: '200px',
              overflowY: 'auto'
            }}
          >
            {displayedDrafts.length === 0 ? (
              <div
                style={{
                  padding: '2rem 1rem',
                  textAlign: 'center',
                  color: '#8aa4c7',
                  fontSize: '0.85rem',
                  lineHeight: 1.6,
                  gridColumn: '1 / -1'
                }}
              >
                {currentArchive
                  ? `"${currentArchive.guideName}" 暂无草稿，点击右上方"新建草稿"创建`
                  : '暂无草稿，点击右上方"新建草稿"创建'}
              </div>
            ) : (
              displayedDrafts.map((draft) => {
                const isActive = activeDraftId === draft.id;
                const isDragging = draggedId === draft.id;
                const isDragOver = dragOverId === draft.id;
                return (
                  <button
                    key={draft.id}
                    draggable={isDraggable[draft.id] || false}
                    onClick={() => handleClick(draft.id)}
                    onMouseDown={() => handleMouseDown(draft.id)}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={() => {
                      if (longPressTimer) {
                        clearTimeout(longPressTimer);
                        setLongPressTimer(null);
                      }
                    }}
                    onDragStart={(e) => handleDragStart(e, draft.id)}
                    onDragOver={(e) => handleDragOver(e, draft.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, draft.id)}
                    onDragEnd={handleDragEnd}
                    style={{
                      border: isDragOver
                        ? '2px solid rgba(102, 192, 244, 0.6)'
                        : '1px solid rgba(102, 192, 244, 0.2)',
                      borderRadius: '0.5rem',
                      background: isActive
                        ? 'rgba(102, 192, 244, 0.22)'
                        : 'rgba(12, 20, 32, 0.7)',
                      color: '#d7e8ff',
                      textAlign: 'left',
                      padding: '0.75rem 0.85rem',
                      fontSize: '0.85rem',
                      cursor: isDragging
                        ? 'grabbing'
                        : isDraggable[draft.id]
                        ? 'grab'
                        : 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                      minHeight: '75px',
                      opacity: isDragging ? 0.5 : 1,
                      transition: 'all 0.15s ease',
                      userSelect: 'none'
                    }}
                  >
                    {/* 第一行：章节名（大号白色） */}
                    <span style={{
                      fontWeight: 600,
                      fontSize: '0.95rem',
                      color: '#d7e8ff',
                      lineHeight: 1.3
                    }}>
                      {getDraftDisplayTitle(draft)}
                    </span>

                    {/* 第二行：草稿名（中号灰色） */}
                    <span style={{
                      fontSize: '0.8rem',
                      color: '#8aa4c7',
                      opacity: 0.85,
                      lineHeight: 1.2
                    }}>
                      {draft.draftName}
                    </span>

                    {/* 第三行：时间戳（小号灰色） */}
                    <span style={{
                      fontSize: '0.7rem',
                      color: '#6b7f9a',
                      opacity: 0.7,
                      lineHeight: 1.2
                    }}>
                      {new Date(draft.updatedAt).toLocaleString('zh-CN', {
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* 操作按钮 */}
          {activeDraft && (
            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                paddingTop: '0.5rem',
                borderTop: '1px solid rgba(102, 192, 244, 0.15)',
                flexWrap: 'wrap'
              }}
            >
              <button
                type="button"
                onClick={() => {
                  const newDraftName = window.prompt('重命名草稿', activeDraft.draftName);
                  if (newDraftName && newDraftName.trim()) {
                    updateDraft(activeDraft.id, { draftName: newDraftName.trim() });
                  }
                }}
                style={subActionButtonStyle}
              >
                重命名草稿
              </button>
              <button
                type="button"
                onClick={() => {
                  const newDraft = duplicateDraft(activeDraft.id);
                  if (newDraft) {
                    selectDraft(newDraft.id);
                  }
                }}
                style={subActionButtonStyle}
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
                style={subActionButtonStyle}
              >
                删除
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

const subActionButtonStyle: React.CSSProperties = {
  flex: 1,
  border: 'none',
  borderRadius: '0.65rem',
  padding: '0.55rem 0.75rem',
  background: 'rgba(20, 33, 52, 0.85)',
  color: '#d7e8ff',
  cursor: 'pointer',
  fontSize: '0.85rem'
};

export default DraftPanel;
