import React, { useState, useMemo } from 'react';
import { useGuideStore, type ChapterInfo } from '../stores/useGuideStore';
import { useChapterSync } from '../hooks/useChapterSync';
import { useSteamGuideImageStore } from '../stores/useSteamGuideImageStore';
import type { ImageState } from '../stores/useSteamGuideImageStore';
import { createChapterOnSteam } from '../services/chapterSync';
import { loggers } from '../../shared/logger';

/**
 * 格式化同步时间
 */
const formatSyncTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - timestamp;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;

  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
};

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
  const imagePoolStatus = useSteamGuideImageStore((state) => state.status);
  const [imageError, setImageError] = useState(false);

  // 从图片池查找图片信息
  const imageInfo = useMemo(() => {
    return imagePool.find((img) => img.previewId === previewId);
  }, [imagePool, previewId]);

  // 构建图片URL
  // 优先使用图片池中的 originalUrl（透明背景），其次 thumbnailUrl
  // 如果图片池还在加载中且找不到图片信息，返回 null（显示占位符）
  const imageUrl = useMemo(() => {
    const poolOriginal = imageInfo?.originalUrl;
    const poolThumbnail = imageInfo?.thumbnailUrl;

    loggers.editor.verbose('ChapterTitleImage building URL:', {
      previewId,
      fileName,
      imageInfo,
      poolOriginal,
      poolThumbnail,
      imagePoolStatus,
      finalUrl: poolOriginal || poolThumbnail || null
    });

    // 如果图片池正在加载且没有找到图片信息，返回 null（显示加载占位符）
    if (!imageInfo && (imagePoolStatus === "loading" || imagePoolStatus === "idle")) {
      return null;
    }

    // 如果图片池已就绪但仍找不到图片，返回 null（显示错误占位符）
    return poolOriginal || poolThumbnail || null;
  }, [previewId, fileName, imageInfo, imagePoolStatus]);

  // 获取图片状态
  const imageState: ImageState = imageInfo?.state || "success";

  return (
    <div
      style={{
        display: 'block',
        position: 'relative',
        width: '100%',
        maxWidth: '100%',
        backgroundColor: (imageError || !imageUrl) ? 'rgba(14, 26, 40, 0.6)' : 'transparent',
        border: (imageError || !imageUrl) ? '1px solid rgba(102, 192, 244, 0.2)' : 'none',
        borderRadius: '3px',
        overflow: 'hidden'
      }}
    >
      {!imageError && imageUrl ? (
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
        // 图片URL不存在或加载失败时显示占位符
        <div style={{
          width: '100%',
          minHeight: '80px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '32px',
          opacity: 0.3
        }}>
          {imagePoolStatus === "loading" || imagePoolStatus === "idle" ? '⏳' : '🖼️'}
        </div>
      )}
    </div>
  );
};

/**
 * 单个章节项组件（使用 React.memo 避免不必要的重渲染）
 * 🔧 性能优化：只在章节自身属性变化时重渲染
 */
const ChapterItem = React.memo<{
  chapter: { sectionId: string; title: string };
  isLinked: boolean;
  isModified: boolean;
  isLoading: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  isBindingMode: boolean;
  boundDraftName?: string;
  onChapterClick: (sectionId: string) => void;
  onPullChapter: (sectionId: string) => void;
  onDragStart: (e: React.DragEvent, sectionId: string) => void;
  onDragOver: (e: React.DragEvent, sectionId: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, targetId: string) => void;
  onDragEnd: () => void;
  renderTitle: (title: string) => React.ReactNode;
}>(({
  chapter,
  isLinked,
  isModified,
  isLoading,
  isDragging,
  isDragOver,
  isBindingMode,
  boundDraftName,
  onChapterClick,
  onPullChapter,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  renderTitle
}) => {
  return (
    <div
      key={chapter.sectionId}
      draggable={!isBindingMode}
      onDragStart={(e) => !isBindingMode && onDragStart(e, chapter.sectionId)}
      onDragOver={(e) => !isBindingMode && onDragOver(e, chapter.sectionId)}
      onDragLeave={() => !isBindingMode && onDragLeave()}
      onDrop={(e) => !isBindingMode && onDrop(e, chapter.sectionId)}
      onDragEnd={() => !isBindingMode && onDragEnd()}
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        borderLeft: isDragOver
          ? '3px solid rgba(102, 192, 244, 0.8)'
          : isModified
            ? '3px solid #FFC107'    // 黄色 - 有修改未提交
            : isLinked
              ? '3px solid #66c0f4'  // 蓝色 - 已拉取
              : '3px solid transparent',
        background: isBindingMode
          ? 'rgba(102, 192, 244, 0.08)'
          : isModified
            ? 'rgba(255, 193, 7, 0.1)'    // 淡黄色
            : isLinked
              ? 'rgba(102, 192, 244, 0.1)' // 淡蓝色
              : 'transparent',
        transition: 'all 0.15s ease',
        opacity: isDragging ? 0.5 : 1,
        cursor: isBindingMode ? 'pointer' : isDragging ? 'grabbing' : 'grab'
      }}
      onMouseEnter={(e) => {
        if (isBindingMode) {
          e.currentTarget.style.background = 'rgba(102, 192, 244, 0.2)';
        } else if (!isLinked && !isDragging) {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
        }
      }}
      onMouseLeave={(e) => {
        if (isBindingMode) {
          e.currentTarget.style.background = 'rgba(102, 192, 244, 0.08)';
        } else if (!isLinked && !isDragging) {
          e.currentTarget.style.background = 'transparent';
        }
      }}
      onClick={() => isBindingMode && onChapterClick(chapter.sectionId)}
    >
      <button
        onClick={(e) => {
          if (isBindingMode) {
            e.stopPropagation();
            return;
          }
          onChapterClick(chapter.sectionId);
        }}
        disabled={isLoading}
        style={{
          border: 'none',
          background: 'transparent',
          color: isBindingMode ? '#66c0f4' : isLinked ? '#ffffff' : '#c5c5c5',
          textAlign: 'left',
          padding: '0.9rem 0.8rem',
          fontSize: '0.88rem',
          cursor: isBindingMode ? 'pointer' : isLoading ? 'wait' : 'pointer',
          flex: 1,
          fontWeight: isBindingMode ? 500 : 400,
          lineHeight: 1.4,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          opacity: isLoading ? 0.6 : 1,
          overflow: 'hidden'
        }}
      >
        {isLoading ? `拉取中...` : renderTitle(chapter.title)}
      </button>

      {/* 显示绑定的草稿名 */}
      {boundDraftName && !isBindingMode && (
        <span
          style={{
            fontSize: '0.7rem',
            color: '#66c0f4',
            padding: '0.15rem 0.4rem',
            background: 'rgba(102, 192, 244, 0.15)',
            borderRadius: '0.25rem',
            marginRight: '0.5rem',
            whiteSpace: 'nowrap'
          }}
        >
          📎 {boundDraftName}
        </span>
      )}

      {/* 绑定模式下显示"选择"提示 */}
      {isBindingMode && (
        <span
          style={{
            fontSize: '0.75rem',
            color: '#66c0f4',
            padding: '0.2rem 0.5rem',
            background: 'rgba(102, 192, 244, 0.2)',
            borderRadius: '0.25rem',
            marginRight: '0.5rem'
          }}
        >
          点击绑定
        </span>
      )}

      {/* 拉取按钮（绑定模式下隐藏） */}
      {!isBindingMode && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPullChapter(chapter.sectionId);
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
      )}
    </div>
  );
});

ChapterItem.displayName = 'ChapterItem';

const ChapterNav: React.FC<ChapterNavProps> = ({ onRefresh, isRefreshing = false }) => {
  // 🔧 性能优化：使用选择器仅订阅需要的状态，避免每次 draft 更新都触发重渲染
  const mode = useGuideStore((state) => state.mode);
  const guideInfo = useGuideStore((state) => state.guideInfo);
  const reorderChapters = useGuideStore((state) => state.reorderChapters);
  const getCurrentArchive = useGuideStore((state) => state.getCurrentArchive);

  // 绑定模式相关
  const isBindingMode = useGuideStore((state) => state.isBindingMode);
  const bindDraftToChapter = useGuideStore((state) => state.bindDraftToChapter);
  const forceBindDraftToChapter = useGuideStore((state) => state.forceBindDraftToChapter);
  const exitBindingMode = useGuideStore((state) => state.exitBindingMode);
  const getDraftByChapterId = useGuideStore((state) => state.getDraftByChapterId);

  const { pullChapter, switchToChapter, getChapterDraft, syncStatus, syncChapterOrder } = useChapterSync();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCreatingChapter, setIsCreatingChapter] = useState(false);

  // 获取当前存档（用于离线数据）
  const currentArchive = getCurrentArchive();

  // 章节数据源：优先使用 guideInfo，离线时使用存档缓存
  const { chapters, isOfflineData, syncTime } = useMemo(() => {
    // 如果是 offline 模式，标记为离线数据
    const isOfflineMode = mode === 'offline';

    // 优先使用 guideInfo（实时数据）
    if (guideInfo?.chapters && Array.isArray(guideInfo.chapters) && guideInfo.chapters.length > 0) {
      return {
        chapters: guideInfo.chapters as ChapterInfo[],
        isOfflineData: isOfflineMode,  // offline 模式下也标记为离线
        syncTime: currentArchive?.chaptersUpdatedAt || Date.now()
      };
    }

    // 回退到存档缓存（离线数据）
    if (currentArchive?.chapters && currentArchive.chapters.length > 0) {
      loggers.editor.info('使用离线缓存的章节数据', {
        count: currentArchive.chapters.length,
        syncTime: currentArchive.chaptersUpdatedAt
      });
      return {
        chapters: currentArchive.chapters,
        isOfflineData: true,
        syncTime: currentArchive.chaptersUpdatedAt
      };
    }

    return { chapters: [], isOfflineData: false, syncTime: 0 };
  }, [mode, guideInfo?.chapters, currentArchive?.chapters, currentArchive?.chaptersUpdatedAt]);

  // 显示章节导航的条件：
  // 1. guide 模式且有章节数据
  // 2. 或者任意模式下有离线缓存的章节数据（允许在离线模式查看缓存）
  // 3. review 模式始终不显示
  if (mode === 'review') {
    return null;
  }
  if (chapters.length === 0) {
    return null;
  }

  const handleChapterClick = (sectionId: string) => {
    // 绑定模式：点击章节触发绑定
    if (isBindingMode) {
      handleBindToChapter(sectionId);
      return;
    }

    // 正常模式：尝试切换到已有的草稿
    const switched = switchToChapter(sectionId);
    if (!switched) {
      // 如果没有草稿，询问是否拉取
      if (window.confirm('该章节尚未拉取，是否立即从 Steam 拉取内容？')) {
        pullChapter(sectionId);
      }
    }
  };

  // 处理绑定操作
  const handleBindToChapter = (sectionId: string) => {
    const chapter = chapters.find((c) => c.sectionId === sectionId);
    if (!chapter) return;

    const result = bindDraftToChapter(sectionId);

    if (result.success) {
      // 绑定成功
      window.alert(`已成功绑定到章节「${chapter.title}」`);
    } else if (result.conflictDraft) {
      // 绑定冲突，询问用户
      const confirmOverride = window.confirm(
        `章节「${chapter.title}」当前已绑定到「${result.conflictDraft.draftName}」\n\n` +
        `是否解除原绑定，并将当前草稿绑定到此章节？`
      );

      if (confirmOverride) {
        const forceResult = forceBindDraftToChapter(sectionId);
        if (forceResult.success) {
          window.alert(`已成功绑定到章节「${chapter.title}」\n原草稿「${result.conflictDraft.draftName}」的绑定已解除。`);
        }
      } else {
        // 用户取消，退出绑定模式
        exitBindingMode();
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
    if (!draggedId || draggedId === targetId || chapters.length === 0) return;

    // 离线模式下禁止拖拽排序（需要连接 Steam）
    if (isOfflineData) {
      window.alert('离线模式下无法重新排序章节，请先刷新连接 Steam');
      return;
    }

    const draggedIndex = chapters.findIndex(c => c.sectionId === draggedId);
    const targetIndex = chapters.findIndex(c => c.sectionId === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newOrder = [...chapters];
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
      loggers.sync.info('章节排序已同步到 Steam');
    } catch (error) {
      loggers.sync.error('章节排序同步失败', error);
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
      loggers.editor.error('章节列表刷新失败', error);
      window.alert('章节列表刷新失败：' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  // 创建新章节
  const handleCreateChapter = async () => {
    if (isCreatingChapter || !guideInfo?.id) return;

    // 离线模式下禁止创建章节
    if (isOfflineData) {
      window.alert('离线模式下无法创建新章节，请先刷新连接 Steam');
      return;
    }

    setIsCreatingChapter(true);
    try {
      const newSectionId = await createChapterOnSteam(guideInfo.id);
      loggers.editor.info('新章节创建成功', { sectionId: newSectionId });

      // 刷新章节列表
      if (onRefresh) {
        await onRefresh();
      }

      window.alert('新章节创建成功！');
    } catch (error) {
      loggers.editor.error('创建章节失败', error);
      window.alert('创建章节失败：' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setIsCreatingChapter(false);
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

    loggers.editor.verbose('renderChapterTitle', {
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
        width: '300px',
        borderRadius: '0.5rem',
        background: 'rgba(23, 26, 33, 0.95)',
        border: isBindingMode
          ? '2px solid rgba(102, 192, 244, 0.6)'
          : '1px solid rgba(69, 75, 87, 0.6)',
        boxShadow: isBindingMode
          ? '0 0 20px rgba(102, 192, 244, 0.3), 0 2px 10px rgba(0, 0, 0, 0.3)'
          : '0 2px 10px rgba(0, 0, 0, 0.3)',
        display: 'flex',
        flexDirection: 'column',
        height: 'fit-content',
        maxHeight: 'calc(100vh - 200px)',
        position: 'sticky',
        top: '1rem',
        overflow: 'hidden',
        transition: 'border 0.2s ease, box-shadow 0.2s ease'
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <h3
            style={{
              margin: 0,
              fontSize: '0.95rem',
              fontWeight: 400,
              color: isBindingMode ? '#66c0f4' : '#c5c5c5',
              letterSpacing: '0.02em',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            {isBindingMode ? '📌 选择要绑定的章节' : (currentArchive ? `${currentArchive.guideName}` : '目录')}
            {isOfflineData && (
              <span
                style={{
                  fontSize: '0.65rem',
                  color: '#FFC107',
                  padding: '0.1rem 0.35rem',
                  background: 'rgba(255, 193, 7, 0.15)',
                  borderRadius: '0.2rem',
                  fontWeight: 500
                }}
              >
                离线
              </span>
            )}
            {(isSyncing || isRefreshing) && (
              <span style={{ fontSize: '0.75rem', color: '#66c0f4' }}>
                {isSyncing ? '同步中...' : '刷新中...'}
              </span>
            )}
          </h3>
          {/* 同步时间显示 */}
          {syncTime > 0 && !isBindingMode && (
            <span
              style={{
                fontSize: '0.7rem',
                color: isOfflineData ? '#FFC107' : '#8b8b8b',
                opacity: 0.8
              }}
            >
              {isOfflineData ? '离线数据 · ' : ''}同步于 {formatSyncTime(syncTime)}
            </span>
          )}
        </div>

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
        {chapters.length === 0 ? (
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
          chapters.map((chapter) => {
            const linkedDraft = getChapterDraft(chapter.sectionId);
            const isLinked = !!linkedDraft;
            // 判断是否有修改但未提交：已拉取 && 更新时间 > 同步时间 + 100ms容差
            // 容差是为了避免拉取时两个时间戳的微小差异（几毫秒）被误判为修改
            const isModified = isLinked && linkedDraft?.lastSyncedAt != null &&
              (linkedDraft.updatedAt - linkedDraft.lastSyncedAt) > 100;
            const status = syncStatus[chapter.sectionId] || 'idle';
            const isLoading = status === 'loading';
            const isDragging = draggedId === chapter.sectionId;
            const isDragOver = dragOverId === chapter.sectionId;

            return (
              <ChapterItem
                key={chapter.sectionId}
                chapter={chapter}
                isLinked={isLinked}
                isModified={isModified}
                isLoading={isLoading}
                isDragging={isDragging}
                isDragOver={isDragOver}
                isBindingMode={isBindingMode}
                boundDraftName={linkedDraft?.draftName}
                onChapterClick={handleChapterClick}
                onPullChapter={pullChapter}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                renderTitle={renderChapterTitle}
              />
            );
          })
        )}

        {/* 新建章节按钮 */}
        <button
          onClick={handleCreateChapter}
          disabled={isCreatingChapter || isBindingMode}
          style={{
            margin: '0.8rem',
            padding: '0.7rem 1rem',
            borderRadius: '0.4rem',
            border: '1px dashed rgba(102, 192, 244, 0.5)',
            background: isCreatingChapter
              ? 'rgba(102, 192, 244, 0.1)'
              : 'transparent',
            color: isBindingMode ? '#6b7f9a' : '#66c0f4',
            fontSize: '0.85rem',
            cursor: isCreatingChapter || isBindingMode ? 'not-allowed' : 'pointer',
            opacity: isBindingMode ? 0.5 : 1,
            transition: 'all 0.15s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem'
          }}
          onMouseEnter={(e) => {
            if (!isCreatingChapter && !isBindingMode) {
              e.currentTarget.style.background = 'rgba(102, 192, 244, 0.15)';
              e.currentTarget.style.borderStyle = 'solid';
            }
          }}
          onMouseLeave={(e) => {
            if (!isCreatingChapter) {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderStyle = 'dashed';
            }
          }}
        >
          {isCreatingChapter ? (
            <>创建中...</>
          ) : (
            <>+ 新建章节</>
          )}
        </button>
      </div>
    </aside>
  );
};

export default ChapterNav;
