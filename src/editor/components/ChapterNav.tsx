import React, { useState, useMemo } from 'react';
import { useGuideStore } from '../stores/useGuideStore';
import { useChapterSync } from '../hooks/useChapterSync';
import { useSteamGuideImageStore } from '../stores/useSteamGuideImageStore';
import type { ImageState } from '../stores/useSteamGuideImageStore';

interface ChapterNavProps {
  onRefresh?: () => Promise<void>;
  isRefreshing?: boolean;
}

/**
 * 迷你状态指示器组件（小圆点，用于章节标题缩略图）
 */
const MiniStateIndicator: React.FC<{ state: ImageState }> = ({ state }) => {
  const color = useMemo(() => {
    switch (state) {
      case "pending":
        return "#808080"; // 灰色
      case "uploading":
        return "#FFC107"; // 黄色
      case "success":
        return "#4CAF50"; // 绿色
      case "error":
        return "#F44336"; // 红色
      default:
        return "#808080";
    }
  }, [state]);

  // 只在非成功状态下显示（成功状态不显示，因为章节标题图片默认都是已上传的）
  if (state === "success") return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: "2px",
        right: "2px",
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        backgroundColor: color,
        border: "1.5px solid rgba(0, 0, 0, 0.6)",
        boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
        zIndex: 10
      }}
    />
  );
};

/**
 * 章节标题图片组件（原尺寸）
 * 用于章节目录导航，显示原尺寸图片（模拟官方效果）
 */
const ChapterTitleImage: React.FC<{
  previewId: string;
  fileName: string;
  titleText?: string; // 可选，目前章节目录不显示文字
}> = ({ previewId, fileName }) => {
  const imagePool = useSteamGuideImageStore((state) => state.items);
  const [imageError, setImageError] = useState(false);

  // 从图片池查找图片信息
  const imageInfo = useMemo(() => {
    return imagePool.find((img) => img.previewId === previewId);
  }, [imagePool, previewId]);

  // 构建图片URL
  // 优先使用图片池中的 thumbnailUrl，如果没有则构造默认URL
  const imageUrl = useMemo(() => {
    const poolThumbnail = imageInfo?.thumbnailUrl;
    const fallbackUrl = `https://steamcommunity-a.akamaihd.net/economy/image/UGC/${previewId}`;

    console.log('[ChapterTitleImage] Building image URL:', {
      previewId,
      fileName,
      imageInfo,
      poolThumbnail,
      finalUrl: poolThumbnail || fallbackUrl
    });

    return poolThumbnail || fallbackUrl;
  }, [previewId, fileName, imageInfo]);

  // 获取图片状态
  const imageState: ImageState = imageInfo?.state || "success";

  return (
    <div
      style={{
        display: 'block',
        position: 'relative',
        width: '100%',
        maxWidth: '240px',
        backgroundColor: imageError ? 'rgba(14, 26, 40, 0.6)' : 'transparent',
        border: imageError ? '1px solid rgba(102, 192, 244, 0.2)' : 'none',
        borderRadius: '3px',
        overflow: 'hidden'
      }}
    >
      {!imageError ? (
        <>
          <img
            src={imageUrl}
            alt={fileName}
            style={{
              width: '100%',
              height: 'auto',
              display: 'block',
              objectFit: 'contain'
            }}
            onError={() => {
              setImageError(true);
            }}
          />
          {/* 迷你状态指示器 */}
          <MiniStateIndicator state={imageState} />
        </>
      ) : (
        // 图片加载失败时显示占位符
        <div style={{
          width: '100%',
          minHeight: '80px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '32px',
          opacity: 0.3
        }}>
          🖼️
        </div>
      )}
    </div>
  );
};

const ChapterNav: React.FC<ChapterNavProps> = ({ onRefresh, isRefreshing = false }) => {
  const { mode, guideInfo, reorderChapters } = useGuideStore();
  const { pullChapter, switchToChapter, getChapterDraft, syncStatus, syncChapterOrder } = useChapterSync();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // 只在 guide 模式下显示章节导航
  if (mode !== 'guide' || !guideInfo || !guideInfo.chapters || !Array.isArray(guideInfo.chapters)) {
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
   * 解析章节标题中的图片 BBCode
   */
  const parseChapterTitleImage = (title: string): { previewId: string; fileName: string } | null => {
    // 匹配 [previewicon=id;size,align;filename][/previewicon]
    const previewIconMatch = title.match(/\[previewicon=(\d+);([^;]+);([^\]]+)\]\[\/previewicon\]/i);
    if (previewIconMatch) {
      return {
        previewId: previewIconMatch[1],
        fileName: previewIconMatch[3]
      };
    }

    // 匹配 [previewimg=id;size,align;filename][/previewimg]
    const previewImgMatch = title.match(/\[previewimg=(\d+);([^;]+);([^\]]+)\]\[\/previewimg\]/i);
    if (previewImgMatch) {
      return {
        previewId: previewImgMatch[1],
        fileName: previewImgMatch[3]
      };
    }

    return null;
  };

  /**
   * 获取章节标题的纯文本（移除所有BBCode）
   */
  const getChapterTitleText = (title: string): string => {
    // 移除图片BBCode
    let text = title.replace(/\[previewicon=[^\]]+\]\[\/previewicon\]/gi, '');
    text = text.replace(/\[previewimg=[^\]]+\]\[\/previewimg\]/gi, '');
    text = text.replace(/\[img\][^\[]+\[\/img\]/gi, '');

    // 移除其他BBCode标签
    text = text.replace(/\[\/?\w+(?:=[^\]]+)?\]/g, '');

    return text.trim();
  };

  /**
   * 渲染章节标题（用于章节目录导航）
   * - 如果包含图片：只显示缩略图，不显示图片后的文字
   * - 如果是纯文字：正常显示文字
   */
  const renderChapterTitle = (title: string) => {
    const imageInfo = parseChapterTitleImage(title);

    console.log('[renderChapterTitle]', {
      title,
      imageInfo,
      rawTitle: title
    });

    // 如果包含图片，只显示图片缩略图
    if (imageInfo) {
      return (
        <ChapterTitleImage
          previewId={imageInfo.previewId}
          fileName={imageInfo.fileName}
          titleText="" // 不显示文字，只显示图片
        />
      );
    }

    // 没有图片时，显示纯文本（移除BBCode标签）
    const titleText = getChapterTitleText(title);
    return titleText || title;
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
