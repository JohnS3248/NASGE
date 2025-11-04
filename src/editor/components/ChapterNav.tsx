import React, { useState } from 'react';
import { useGuideStore } from '../stores/useGuideStore';
import { useChapterSync } from '../hooks/useChapterSync';
import { bbcodeToHtml } from '../utils/bbcode';

interface ChapterNavProps {
  onRefresh?: () => Promise<void>;
  isRefreshing?: boolean;
}

const ChapterNav: React.FC<ChapterNavProps> = ({ onRefresh, isRefreshing = false }) => {
  const { mode, guideInfo, reorderChapters } = useGuideStore();
  const { pullChapter, switchToChapter, getChapterDraft, syncStatus, syncChapterOrder } = useChapterSync();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // 只在 guide 模式下显示章节导航
  if (mode !== 'guide' || !guideInfo) {
    return null;
  }

  const handleChapterClick = (sectionId: string) => {
    // 尝试切换到已有的草稿
    const switched = switchToChapter(sectionId);
    if (!switched) {
      // 如果没有草稿，询问是否拉取
      if (window.confirm('该章节尚未拉取，是否立即从 Steam 拉取内容？')) {
        pullChapter(sectionId);
      }
    }
  };

  const handleDragStart = (e: React.DragEvent, sectionId: string) => {
    setDraggedId(sectionId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', sectionId);
  };

  const handleDragOver = (e: React.DragEvent, sectionId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedId && draggedId !== sectionId) {
      setDragOverId(sectionId);
    }
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId || !guideInfo) return;

    const draggedIndex = guideInfo.chapters.findIndex(c => c.sectionId === draggedId);
    const targetIndex = guideInfo.chapters.findIndex(c => c.sectionId === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newOrder = [...guideInfo.chapters];
    const [removed] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, removed);

    const orderedSectionIds = newOrder.map(c => c.sectionId);

    // 先更新本地状态
    reorderChapters(orderedSectionIds);
    setDraggedId(null);
    setDragOverId(null);

    // 同步到 Steam
    setIsSyncing(true);
    try {
      await syncChapterOrder(orderedSectionIds);
      console.log('[ChapterNav] 章节排序已同步到 Steam');
    } catch (error) {
      console.error('[ChapterNav] 章节排序同步失败', error);
      window.alert('章节排序同步到 Steam 失败：' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleRefresh = async () => {
    if (!onRefresh || isRefreshing) return;

    try {
      await onRefresh();
      window.alert('章节列表已刷新');
    } catch (error) {
      console.error('[ChapterNav] 刷新失败', error);
      window.alert('章节列表刷新失败：' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  /**
   * 渲染章节标题（支持 BBCode 图片）
   */
  const renderChapterTitle = (title: string) => {
    // 将 BBCode 转换为 HTML
    const html = bbcodeToHtml(title);

    // 如果标题包含 HTML 标签（图片等），使用 dangerouslySetInnerHTML
    if (html.includes('<')) {
      return (
        <span
          dangerouslySetInnerHTML={{ __html: html }}
          style={{
            display: 'inline-block',
            maxWidth: '100%',
            wordBreak: 'break-word'
          }}
        />
      );
    }

    // 否则直接显示文本
    return title;
  };

  return (
    <aside
      style={{
        width: '280px',
        borderRadius: '0.5rem',
        background: 'rgba(23, 26, 33, 0.95)',
        border: '1px solid rgba(69, 75, 87, 0.6)',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.3)',
        display: 'flex',
        flexDirection: 'column',
        height: 'fit-content',
        maxHeight: 'calc(100vh - 200px)',
        position: 'sticky',
        top: '1rem',
        overflow: 'hidden'
      }}
    >
      {/* 头部 */}
      <div
        style={{
          padding: '1rem 1.2rem',
          borderBottom: '1px solid rgba(69, 75, 87, 0.4)',
          background: 'rgba(16, 18, 23, 0.6)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: '0.95rem',
            fontWeight: 400,
            color: '#c5c5c5',
            letterSpacing: '0.02em',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          目录
          {(isSyncing || isRefreshing) && (
            <span style={{ fontSize: '0.75rem', color: '#66c0f4' }}>
              {isSyncing ? '同步中...' : '刷新中...'}
            </span>
          )}
        </h3>

        {/* 刷新按钮 */}
        {onRefresh && (
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing || isSyncing}
            style={{
              padding: '0.3rem 0.6rem',
              border: 'none',
              borderRadius: '0.3rem',
              background: 'rgba(102, 192, 244, 0.15)',
              color: '#66c0f4',
              fontSize: '0.75rem',
              cursor: isRefreshing || isSyncing ? 'not-allowed' : 'pointer',
              opacity: isRefreshing || isSyncing ? 0.5 : 1,
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              if (!isRefreshing && !isSyncing) {
                e.currentTarget.style.background = 'rgba(102, 192, 244, 0.25)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(102, 192, 244, 0.15)';
            }}
            title="刷新章节列表"
          >
            ↻ 刷新
          </button>
        )}
      </div>

      {/* 章节列表 */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          flex: 1
        }}
      >
        {guideInfo.chapters.length === 0 ? (
          <div
            style={{
              padding: '2rem 1.2rem',
              textAlign: 'center',
              color: '#8b8b8b',
              fontSize: '0.85rem',
              lineHeight: 1.6
            }}
          >
            该指南暂无章节
          </div>
        ) : (
          guideInfo.chapters.map((chapter) => {
            const linkedDraft = getChapterDraft(chapter.sectionId);
            const isLinked = !!linkedDraft;
            const status = syncStatus[chapter.sectionId] || 'idle';
            const isLoading = status === 'loading';
            const isDragging = draggedId === chapter.sectionId;
            const isDragOver = dragOverId === chapter.sectionId;

            return (
              <div
                key={chapter.sectionId}
                draggable
                onDragStart={(e) => handleDragStart(e, chapter.sectionId)}
                onDragOver={(e) => handleDragOver(e, chapter.sectionId)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, chapter.sectionId)}
                onDragEnd={handleDragEnd}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  borderLeft: isDragOver
                    ? '3px solid rgba(102, 192, 244, 0.8)'
                    : isLinked ? '3px solid #66c0f4' : '3px solid transparent',
                  background: isLinked ? 'rgba(102, 192, 244, 0.1)' : 'transparent',
                  transition: 'all 0.15s ease',
                  opacity: isDragging ? 0.5 : 1,
                  cursor: isDragging ? 'grabbing' : 'grab'
                }}
                onMouseEnter={(e) => {
                  if (!isLinked && !isDragging) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLinked && !isDragging) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <button
                  onClick={() => handleChapterClick(chapter.sectionId)}
                  disabled={isLoading}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: isLinked ? '#ffffff' : '#c5c5c5',
                    textAlign: 'left',
                    padding: '0.9rem 0.8rem',
                    fontSize: '0.88rem',
                    cursor: isLoading ? 'wait' : 'pointer',
                    flex: 1,
                    fontWeight: 400,
                    lineHeight: 1.4,
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    opacity: isLoading ? 0.6 : 1,
                    overflow: 'hidden'
                  }}
                >
                  {isLoading ? `拉取中...` : renderChapterTitle(chapter.title)}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    pullChapter(chapter.sectionId);
                  }}
                  disabled={isLoading}
                  title="从 Steam 拉取章节内容"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#66c0f4',
                    padding: '0.5rem 0.8rem',
                    fontSize: '0.85rem',
                    cursor: isLoading ? 'wait' : 'pointer',
                    opacity: isLoading ? 0.5 : 0.7,
                    transition: 'opacity 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!isLoading) e.currentTarget.style.opacity = '1';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '0.7';
                  }}
                >
                  ↓
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};

export default ChapterNav;
