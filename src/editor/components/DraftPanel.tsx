import React, { useState } from 'react';
import { useGuideStore } from '../stores/useGuideStore';

const DraftPanel: React.FC = () => {
  const { drafts, activeDraftId, selectDraft, addDraft, updateDraft, deleteDraft, duplicateDraft, reorderDrafts } = useGuideStore();
  const [isOpen, setIsOpen] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [isDraggable, setIsDraggable] = useState<{ [key: string]: boolean }>({});
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);

  const activeDraft = drafts.find((d) => d.id === activeDraftId);

  // 鼠标按下开始计时（长按检测）
  const handleMouseDown = (draftId: string) => {
    console.log('[NASGE] mouseDown:', draftId);

    const timer = setTimeout(() => {
      // 长按 500ms 后启用拖拽
      setIsDraggable({ [draftId]: true });
      // 添加视觉反馈
      console.log('[NASGE] 长按触发，启用拖拽模式');
    }, 500);

    setLongPressTimer(timer);
  };

  // 鼠标抬起时清除计时器
  const handleMouseUp = () => {
    console.log('[NASGE] mouseUp');

    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  // 点击事件（只在未拖拽时触发）
  const handleClick = (draftId: string) => {
    console.log('[NASGE] click:', draftId, 'isDraggable:', isDraggable[draftId]);

    // 如果当前是拖拽模式，不触发点击
    if (isDraggable[draftId]) {
      console.log('[NASGE] 忽略点击（拖拽模式）');
      setIsDraggable({});
      return;
    }

    console.log('[NASGE] 切换草稿');
    selectDraft(draftId);
  };

  const handleDragStart = (e: React.DragEvent, draftId: string) => {
    console.log('[NASGE] dragStart 触发', { draftId, isDraggable: isDraggable[draftId] });

    // 只有在启用拖拽模式时才允许拖拽
    if (!isDraggable[draftId]) {
      console.log('[NASGE] 阻止拖拽：未启用拖拽模式');
      e.preventDefault();
      return;
    }

    console.log('[NASGE] 开始拖拽');
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
    console.log('[NASGE] 拖拽结束');
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
              <span style={{ color: '#d7e8ff', fontWeight: 500 }}>
                {activeDraft.title || '未命名章节'}
              </span>
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
            {drafts.length === 0 ? (
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
                暂无草稿，点击上方"新建草稿"创建第一个草稿
              </div>
            ) : (
              drafts.map((draft) => {
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
                      {draft.title || '未命名章节'}
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
                borderTop: '1px solid rgba(102, 192, 244, 0.15)'
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
