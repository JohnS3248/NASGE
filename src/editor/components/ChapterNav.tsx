import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useGuideStore, type ChapterInfo } from '../stores/useGuideStore';
import { useArchiveStore } from '../stores/useArchiveStore';
import { useDraftStore } from '../stores/useDraftStore';
import { useEditorConfigStore } from '../stores/useEditorConfigStore';
import { useChapterSync } from '../hooks/useChapterSync';
import { createChapterOnSteam } from '../services/chapterSync';
import { loggers } from '../../shared/logger';
import { toast } from '../stores/useToastStore';
import { dialog } from '../stores/useDialogStore';
import { SkeletonLine } from './Skeleton';

/* ── Lucide SVG 图标 ─────────────────────────────────────── */

const RotateCwIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
  </svg>
);

const XIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
  </svg>
);

const MenuIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 5h16" /><path d="M4 12h16" /><path d="M4 19h16" />
  </svg>
);

const ArrowDownIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14" /><path d="m19 12-7 7-7-7" />
  </svg>
);

const PlusIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14" /><path d="M12 5v14" />
  </svg>
);

const Loader2Icon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

// Lucide Lock icon
const LockIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

// Lucide Unlock icon
const UnlockIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" />
  </svg>
);

/* ── Tailwind class 常量 ─────────────────────────────────── */

// 状态 border
const borderLinked = "border-l-[3px] border-l-accent";
const borderModified = "border-l-[3px] border-l-warning";
const borderNone = "border-l-[3px] border-l-transparent";

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

/* ── 固定模式默认位置 ────────────────────────────────────── */

const FIXED_STYLE: React.CSSProperties = {
  position: 'fixed',
  right: '1rem',
  top: '14rem',
  maxHeight: 'calc(100vh - 15rem)',
  zIndex: 100,
  pointerEvents: 'auto',
};

interface ChapterNavProps {
  onRefresh?: () => Promise<void>;
  isRefreshing?: boolean;
}

/**
 * 章节标题图片组件
 * 直接使用从 preview 页解析的透明图片 URL，不依赖图片池
 */
const ChapterTitleImage: React.FC<{
  url: string;
  fileName: string;
}> = ({ url, fileName }) => {
  const [imageError, setImageError] = useState(false);

  return (
    <div className={`block relative w-full max-w-full overflow-hidden rounded-sm ${imageError ? 'bg-bg-app/60 border border-accent/20' : 'bg-transparent'}`}>
      {!imageError ? (
        <img
          src={url}
          alt={fileName}
          className="w-full h-auto block object-contain"
          onError={() => setImageError(true)}
        />
      ) : (
        <div className="w-full min-h-[80px] flex items-center justify-center opacity-30">
          <svg className="w-8 h-8 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
          </svg>
        </div>
      )}
    </div>
  );
};

/* ── 骨架屏组件 ─────────────────────────────────────────── */

const ChapterNavSkeleton: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <aside
    className="w-[300px] rounded-lg bg-bg-app/80 border border-border-subtle shadow-md flex flex-col overflow-hidden animate-dropdown-enter"
    style={style}
  >
    {/* 头部骨架 */}
    <div className="px-2.5 py-2.5 border-b border-border-subtle bg-bg-app/60 flex justify-between items-center">
      <SkeletonLine width="55%" height={16} />
      <div className="flex items-center gap-1.5">
        <SkeletonLine width={20} height={20} className="rounded" />
        <SkeletonLine width={20} height={20} className="rounded" />
      </div>
    </div>
    {/* 章节项骨架 */}
    <div className="flex flex-col gap-0.5 p-1">
      {[85, 70, 92, 60, 78, 45].map((w, i) => (
        <div key={i} className={`py-2 px-2.5 ${borderNone}`}>
          <SkeletonLine width={`${w}%`} height={14} />
        </div>
      ))}
    </div>
  </aside>
);

/**
 * 单个章节项组件（使用 React.memo 避免不必要的重渲染）
 */
const ChapterItem = React.memo<{
  chapter: { sectionId: string; title: string; titleImageUrl?: string };
  isLinked: boolean;
  isModified: boolean;
  isLoading: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  boundDraftName?: string;
  onChapterClick: (sectionId: string) => void;
  onPullChapter: (sectionId: string) => void;
  onDragStart: (e: React.DragEvent, sectionId: string) => void;
  onDragOver: (e: React.DragEvent, sectionId: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, targetId: string) => void;
  onDragEnd: () => void;
  renderTitle: (chapter: { title: string; titleImageUrl?: string }) => React.ReactNode;
}>(({
  chapter, isLinked, isModified, isLoading, isDragging, isDragOver,
  boundDraftName, onChapterClick, onPullChapter, onDragStart, onDragOver,
  onDragLeave, onDrop, onDragEnd, renderTitle
}) => {
  // 状态 border class
  const borderClass = isDragOver
    ? "border-l-[3px] border-l-accent/80"
    : isModified ? borderModified : isLinked ? borderLinked : borderNone;

  // 背景 class
  const bgClass = isModified
    ? "bg-warning/10"
    : isLinked
      ? "bg-accent-subtle"
      : "hover:bg-white/5";

  return (
    <div
      key={chapter.sectionId}
      draggable
      onDragStart={(e) => onDragStart(e, chapter.sectionId)}
      onDragOver={(e) => onDragOver(e, chapter.sectionId)}
      onDragLeave={() => onDragLeave()}
      onDrop={(e) => onDrop(e, chapter.sectionId)}
      onDragEnd={() => onDragEnd()}
      className={`flex items-center flex-wrap nasge-transition-quick ${borderClass} ${bgClass} ${isDragging ? 'opacity-50 cursor-grabbing' : 'cursor-grab'}`}
    >
      <button
        onClick={() => onChapterClick(chapter.sectionId)}
        disabled={isLoading}
        className={`border-0 bg-transparent text-left py-2 px-2.5 text-sm flex-1 font-normal leading-relaxed overflow-hidden ${isLinked ? 'text-white' : 'text-[#c5c5c5]'} ${isLoading ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}
      >
        {isLoading ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
            拉取中
          </span>
        ) : renderTitle(chapter)}
      </button>

      {/* 显示绑定的草稿名 */}
      {boundDraftName && (
        <span className="text-[11px] text-accent px-1.5 bg-accent-subtle rounded mr-2 whitespace-nowrap">
          {boundDraftName}
        </span>
      )}

      {/* 拉取按钮 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onPullChapter(chapter.sectionId);
        }}
        disabled={isLoading}
        title="从 Steam 拉取章节内容"
        className={`border-0 bg-transparent text-accent px-2.5 py-1.5 cursor-pointer nasge-transition-quick ${isLoading ? 'opacity-50 cursor-wait' : 'opacity-70 hover:opacity-100'}`}
      >
        <ArrowDownIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
});

ChapterItem.displayName = 'ChapterItem';

const ChapterNav: React.FC<ChapterNavProps> = ({ onRefresh, isRefreshing = false }) => {
  const mode = useGuideStore((state) => state.mode);
  const guideInfo = useGuideStore((state) => state.guideInfo);
  const reorderChapters = useGuideStore((state) => state.reorderChapters);
  const currentArchiveId = useGuideStore((state) => state.currentArchiveId);
  const currentArchive = useArchiveStore((state) => currentArchiveId ? state.archives[currentArchiveId] : undefined);
  const getDraftByChapterId = useDraftStore((state) => state.getDraftByChapterId);

  // 章节导航模式/位置（持久化）
  const navMode = useEditorConfigStore((s) => s.chapterNavMode);
  const navPos = useEditorConfigStore((s) => s.chapterNavPos);
  const setNavMode = useEditorConfigStore((s) => s.setChapterNavMode);
  const setNavPos = useEditorConfigStore((s) => s.setChapterNavPos);

  const { pullChapter, switchToChapter, getChapterDraft, syncStatus, syncChapterOrder } = useChapterSync();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCreatingChapter, setIsCreatingChapter] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // 活动模式拖拽 state
  const [isDraggingNav, setIsDraggingNav] = useState(false);
  const [floatingPos, setFloatingPos] = useState({ x: navPos.x, y: navPos.y });
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);

  // 同步 store → local state（仅初始化/store 外部修改时）
  useEffect(() => {
    if (!isDraggingNav) {
      setFloatingPos({ x: navPos.x, y: navPos.y });
    }
  }, [navPos.x, navPos.y, isDraggingNav]);

  /* ── 活动模式拖拽处理 ────────────────────────────────────── */

  const handleNavMouseDown = useCallback((e: React.MouseEvent) => {
    if (navMode !== 'movable') return;
    // 忽略按钮点击
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    // -1 表示使用默认位置，需要解析为实际像素值
    const posX = floatingPos.x < 0 ? window.innerWidth - 316 : floatingPos.x;
    const posY = floatingPos.y < 0 ? 224 : floatingPos.y;
    dragStartRef.current = { x: e.clientX, y: e.clientY, posX, posY };
    setIsDraggingNav(true);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
  }, [navMode, floatingPos]);

  useEffect(() => {
    if (!isDraggingNav) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const newX = Math.max(0, Math.min(window.innerWidth - 60, dragStartRef.current.posX + dx));
      const newY = Math.max(0, Math.min(window.innerHeight - 60, dragStartRef.current.posY + dy));
      setFloatingPos({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDraggingNav(false);
      dragStartRef.current = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      // 持久化位置
      setFloatingPos((pos) => {
        setNavPos(pos);
        return pos;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingNav, setNavPos]);

  /* ── 位置样式计算 ────────────────────────────────────────── */

  const positionStyle = useCallback((): React.CSSProperties => {
    if (navMode === 'movable') {
      // 活动模式：使用 left/top 绝对定位
      const x = floatingPos.x < 0 ? window.innerWidth - 316 : floatingPos.x;
      const y = floatingPos.y < 0 ? 224 : floatingPos.y;
      return {
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 100,
        pointerEvents: 'auto',
        cursor: isDraggingNav ? 'grabbing' : 'grab',
      };
    }
    // 固定模式
    return FIXED_STYLE;
  }, [navMode, floatingPos, isDraggingNav]);

  const { chapters, isOfflineData, syncTime } = useMemo(() => {
    const isOfflineMode = mode === 'offline-guide' || mode === 'offline-review';

    if (guideInfo?.chapters && Array.isArray(guideInfo.chapters) && guideInfo.chapters.length > 0) {
      return {
        chapters: guideInfo.chapters as ChapterInfo[],
        isOfflineData: isOfflineMode,
        syncTime: currentArchive?.chaptersUpdatedAt || Date.now()
      };
    }

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

  if (mode === 'review') return null;

  // 骨架屏：指南模式下数据尚未加载
  if (chapters.length === 0) {
    if (mode !== 'offline-guide' && guideInfo === null) {
      return <ChapterNavSkeleton style={positionStyle()} />;
    }
    return null;
  }

  const handleChapterClick = async (sectionId: string) => {
    const switched = switchToChapter(sectionId);
    if (!switched) {
      if (await dialog.confirm({ message: '该章节尚未拉取，是否立即从 Steam 拉取内容？' })) {
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
    if (!draggedId || draggedId === targetId || chapters.length === 0) return;

    if (isOfflineData) {
      toast.warning('离线模式下无法重新排序章节，请先刷新连接 Steam');
      return;
    }

    const draggedIndex = chapters.findIndex(c => c.sectionId === draggedId);
    const targetIndex = chapters.findIndex(c => c.sectionId === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newOrder = [...chapters];
    const [removed] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, removed);

    const orderedSectionIds = newOrder.map(c => c.sectionId);

    reorderChapters(orderedSectionIds);
    setDraggedId(null);
    setDragOverId(null);

    setIsSyncing(true);
    try {
      await syncChapterOrder(orderedSectionIds);
      loggers.sync.info('章节排序已同步到 Steam');
    } catch (error) {
      loggers.sync.error('章节排序同步失败', error);
      toast.error('章节排序同步到 Steam 失败：' + (error instanceof Error ? error.message : '未知错误'));
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
      toast.success('章节列表已刷新');
    } catch (error) {
      loggers.editor.error('章节列表刷新失败', error);
      toast.error('章节列表刷新失败：' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  const handleCreateChapter = async () => {
    if (isCreatingChapter || !guideInfo?.id) return;

    if (isOfflineData) {
      toast.warning('离线模式下无法创建新章节，请先刷新连接 Steam');
      return;
    }

    setIsCreatingChapter(true);
    try {
      const newSectionId = await createChapterOnSteam(guideInfo.id);
      loggers.editor.info('新章节创建成功', { sectionId: newSectionId });
      if (onRefresh) await onRefresh();
    } catch (error) {
      loggers.editor.error('创建章节失败', error);
      toast.error('创建章节失败：' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setIsCreatingChapter(false);
    }
  };

  const parseChapterTitleImage = (title: string): { previewId: string; fileName: string } | null => {
    const previewIconMatch = title.match(/\[previewicon=(\d+);([^;]+);([^\]]+)\]\[\/previewicon\]/i);
    if (previewIconMatch) {
      return { previewId: previewIconMatch[1], fileName: previewIconMatch[3] };
    }

    const previewImgMatch = title.match(/\[previewimg=(\d+);([^;]+);([^\]]+)\]\[\/previewimg\]/i);
    if (previewImgMatch) {
      return { previewId: previewImgMatch[1], fileName: previewImgMatch[3] };
    }

    return null;
  };

  const getChapterTitleText = (title: string): string => {
    let text = title.replace(/\[previewicon=[^\]]+\]\[\/previewicon\]/gi, '');
    text = text.replace(/\[previewimg=[^\]]+\]\[\/previewimg\]/gi, '');
    text = text.replace(/\[img\][^\[]+\[\/img\]/gi, '');
    text = text.replace(/\[\/?\w+(?:=[^\]]+)?\]/g, '');
    return text.trim();
  };

  const renderChapterTitle = (chapter: { title: string; titleImageUrl?: string }) => {
    // 优先使用从 preview 页解析的透明图片 URL
    if (chapter.titleImageUrl) {
      const imageInfo = parseChapterTitleImage(chapter.title);
      return (
        <ChapterTitleImage
          url={chapter.titleImageUrl}
          fileName={imageInfo?.fileName || ''}
        />
      );
    }

    const titleText = getChapterTitleText(chapter.title);
    return titleText || chapter.title;
  };

  const toggleNavMode = () => {
    const next = navMode === 'fixed' ? 'movable' : 'fixed';
    setNavMode(next);
    if (next === 'fixed') {
      // 回到固定模式时重置位置
      setNavPos({ x: -1, y: -1 });
    }
  };

  /* ── 折叠态 ────────────────────────────────────────────── */

  if (isCollapsed) {
    return (
      <aside style={positionStyle()}>
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          className="w-9 h-9 rounded-md bg-bg-app/95 border border-border-subtle text-text-muted hover:text-text-primary hover:bg-bg-hover nasge-transition-quick cursor-pointer flex items-center justify-center shadow-md"
          title="展开目录"
        >
          <MenuIcon className="w-4 h-4" />
        </button>
      </aside>
    );
  }

  /* ── 展开态 ────────────────────────────────────────────── */

  return (
    <aside
      className="w-[300px] rounded-lg bg-bg-app/80 border border-border-subtle shadow-md flex flex-col max-h-full overflow-hidden animate-dropdown-enter"
      style={positionStyle()}
      onMouseDown={handleNavMouseDown}
    >
      {/* 头部 */}
      <div className="px-2.5 py-2.5 border-b border-border-subtle bg-bg-app/60 flex justify-between items-center">
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <h3 className="m-0 text-sm text-text-secondary font-normal flex items-center gap-2">
            {currentArchive ? currentArchive.guideName : '目录'}
            {isOfflineData && (
              <span className="text-[10px] text-warning bg-warning/15 rounded px-1.5 py-0.5 font-medium">
                离线
              </span>
            )}
            {(isSyncing || isRefreshing) && (
              <span className="text-xs text-accent inline-flex items-center gap-1">
                <Loader2Icon className="w-3 h-3 animate-spin" />
                {isSyncing ? '同步中' : '刷新中'}
              </span>
            )}
          </h3>
          {syncTime > 0 && (
            <span className={`text-[11px] ${isOfflineData ? 'text-warning' : 'text-text-muted'}`}>
              {isOfflineData ? '离线数据 · ' : ''}同步于 {formatSyncTime(syncTime)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* 模式切换按钮 */}
          <button
            type="button"
            onClick={toggleNavMode}
            className={`border-0 bg-transparent p-1 nasge-transition-quick cursor-pointer ${navMode === 'movable' ? 'text-accent hover:text-accent-hover' : 'text-text-muted hover:text-text-primary'}`}
            title={navMode === 'fixed' ? '切换为可拖拽模式' : '切换为固定模式'}
          >
            {navMode === 'fixed' ? <LockIcon className="w-3.5 h-3.5" /> : <UnlockIcon className="w-3.5 h-3.5" />}
          </button>
          {/* 刷新按钮 */}
          {onRefresh && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing || isSyncing}
              className={`border-0 bg-transparent text-accent p-1 nasge-transition-quick ${isRefreshing || isSyncing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:text-accent-hover'}`}
              title="刷新章节列表"
            >
              <RotateCwIcon className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          )}
          {/* 折叠按钮 */}
          <button
            type="button"
            onClick={() => setIsCollapsed(true)}
            className="border-0 bg-transparent text-text-muted hover:text-text-primary p-1 nasge-transition-quick cursor-pointer"
            title="收起目录"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 章节列表 */}
      <div className="flex flex-col overflow-y-auto flex-1">
        {chapters.length === 0 ? (
          <div className="py-8 px-3 text-center text-text-muted text-sm leading-relaxed">
            该指南暂无章节
          </div>
        ) : (
          chapters.map((chapter) => {
            const linkedDraft = getChapterDraft(chapter.sectionId);
            const isLinked = !!linkedDraft;
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

        {/* 新建章节按钮 — 融入章节列表 */}
        <button
          onClick={handleCreateChapter}
          disabled={isCreatingChapter}
          className={`border-0 bg-transparent text-accent/60 text-sm py-2 px-2.5 text-left nasge-transition-quick flex items-center gap-1.5 ${borderNone} ${isCreatingChapter ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-white/5 hover:text-accent'}`}
        >
          {isCreatingChapter ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
              创建中
            </span>
          ) : (
            <>
              <PlusIcon className="w-3.5 h-3.5" />
              新建章节
            </>
          )}
        </button>
      </div>
    </aside>
  );
};

export default ChapterNav;
