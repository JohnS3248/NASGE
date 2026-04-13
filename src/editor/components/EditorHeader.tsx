import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useGuideStore, type GuideArchive, isReviewMode } from '../stores/useGuideStore';
import { useArchiveStore } from '../stores/useArchiveStore';
import { useDraftStore } from '../stores/useDraftStore';
import { useReviewStore } from '../stores/useReviewStore';
import { SettingsModal } from './SettingsModal';
import { ArchiveManageModal } from './ArchiveManageModal';
import { ChangelogModal } from './ChangelogModal';
import { useMountTransition } from '../hooks/useMountTransition';
import { useEditorConfigStore } from '../stores/useEditorConfigStore';
import { VERSION } from '../../../version';

// ============================================================================
// 模式配置
// ============================================================================

const MODE_DOT = {
  'guide':          'bg-accent',
  'review':         'bg-warning',
  'offline-guide':  'bg-text-muted',
  'offline-review': 'bg-text-muted',
} as const;

const MODE_I18N_KEY = {
  'guide':          'editor:mode.guide',
  'review':         'editor:mode.review',
  'offline-guide':  'editor:mode.offlineGuide',
  'offline-review': 'editor:mode.offlineReview',
} as const;

// ============================================================================
// 面包屑分隔符
// ============================================================================

const BreadcrumbSep: React.FC = () => (
  <span className="text-text-muted text-xs select-none mx-1.5">/</span>
);

// ============================================================================
// EditorHeader
// ============================================================================

const EditorHeader: React.FC = () => {
  const { t } = useTranslation('editor');
  const mode = useGuideStore((s) => s.mode);
  const guideInfo = useGuideStore((s) => s.guideInfo);
  const currentArchiveId = useGuideStore((s) => s.currentArchiveId);
  const switchArchive = useGuideStore((s) => s.switchArchive);
  const archives = useArchiveStore((s) => s.archives);
  const currentArchive = useArchiveStore((s) => currentArchiveId ? s.archives[currentArchiveId] : undefined);
  const drafts = useDraftStore((s) => s.drafts);

  const [settingsVisible, setSettingsVisible] = useState(false);
  const [changelogVisible, setChangelogVisible] = useState(false);
  const markChangelogSeen = useEditorConfigStore((s) => s.markChangelogSeen);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [gameOpen, setGameOpen] = useState(false);
  const shouldRenderArchive = useMountTransition(archiveOpen, 100);
  const shouldRenderGame = useMountTransition(gameOpen, 100);
  const [manageModalVisible, setManageModalVisible] = useState(false);
  const archiveRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<HTMLDivElement>(null);

  const reviewGameName = useReviewStore((s) => s.gameName);
  const reviewAppId = useReviewStore((s) => s.appId);
  const inReviewMode = isReviewMode(mode);

  const archiveList = Object.values(archives);
  const modeDot = MODE_DOT[mode] ?? MODE_DOT['guide'];
  const modeLabel = t(MODE_I18N_KEY[mode] ?? MODE_I18N_KEY['guide']);

  // 离线评测：从草稿提取不重复的游戏列表
  const gameList = useMemo(() => {
    const games = new Map<string, string>();
    drafts
      .filter(d => d.draftType === 'review' && d.linkedAppId)
      .forEach(d => games.set(d.linkedAppId!, d.linkedAppName || `App ${d.linkedAppId}`));
    return Array.from(games, ([appId, name]) => ({ appId, name }));
  }, [drafts]);

  // 更新日志自动弹出（不依赖 tour 状态，changelog 优先于 tour）
  useEffect(() => {
    const { changelogSeenVersion } = useEditorConfigStore.getState();
    if (changelogSeenVersion === VERSION) return;
    setChangelogVisible(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChangelogClose = useCallback(() => {
    setChangelogVisible(false);
    markChangelogSeen();
  }, [markChangelogSeen]);

  // 下拉外部点击关闭
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (archiveRef.current && !archiveRef.current.contains(e.target as Node)) {
      setArchiveOpen(false);
    }
    if (gameRef.current && !gameRef.current.contains(e.target as Node)) {
      setGameOpen(false);
    }
  }, []);

  useEffect(() => {
    if (archiveOpen || gameOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [archiveOpen, gameOpen, handleClickOutside]);

  // 模式描述
  const subtitle = mode === 'guide' && guideInfo
    ? t('header.guideInfo', { id: guideInfo.id, count: guideInfo.chapters.length })
    : mode === 'guide' && !guideInfo
    ? t('header.guideConnecting')
    : inReviewMode && reviewGameName
    ? `${reviewGameName}${reviewAppId ? ` · ID ${reviewAppId}` : ''}`
    : inReviewMode
    ? t('header.editReview')
    : t('header.offlineSubtitle');

  // 是否显示存档选择器（指南/评测在线模式绑定 Steam 页面，不允许切换）
  const showArchiveSelector = mode !== 'guide' && !inReviewMode && archiveList.length > 0;
  // 离线评测：显示游戏选择器
  const showGameSelector = mode === 'offline-review' && gameList.length > 0;

  return (
    <>
      <header data-tour="editor-header" className="
        flex items-center gap-3 px-5 py-3
        rounded-lg
        bg-bg-surface border border-border-default
        shadow-panel
      ">
        {/* 左侧：品牌 + 面包屑 */}
        <div className="flex items-center gap-0 min-w-0 flex-1">
          {/* 品牌 */}
          <span className="
            text-sm font-semibold tracking-wide text-text-secondary
            select-none shrink-0
          ">
            NASGE
          </span>

          <BreadcrumbSep />

          {/* 模式徽标 */}
          <span className="
            inline-flex items-center gap-1.5 shrink-0
            text-xs font-medium text-text-secondary
          ">
            <span className={`w-1.5 h-1.5 rounded-full ${modeDot}`} />
            {modeLabel}
          </span>

          <BreadcrumbSep />

          {/* 标题 / 描述 */}
          <span className="text-sm text-text-primary truncate" title={subtitle}>
            {inReviewMode
              ? (reviewGameName || subtitle)
              : (guideInfo?.title || subtitle)}
          </span>

          {/* 章节数（指南模式下显示） */}
          {mode === 'guide' && guideInfo && (
            <span className="text-xs text-text-muted ml-1.5 shrink-0">
              · {guideInfo.chapters.length} {t('header.chaptersUnit')}
            </span>
          )}
        </div>

        {/* 右侧：选择器 + 设置 */}
        <div className="flex items-center gap-2 shrink-0">
          {/* 游戏选择器（离线评测） */}
          {showGameSelector && (
            <div ref={gameRef} className="relative">
              <button
                type="button"
                onClick={() => setGameOpen(!gameOpen)}
                className="
                  flex items-center gap-1.5 px-2.5 py-1.5
                  rounded-md border border-border-default
                  bg-transparent
                  text-xs text-text-secondary
                  hover:text-text-primary hover:border-border-accent hover:bg-accent-subtle
                  nasge-transition-quick cursor-pointer
                "
              >
                <span className="truncate max-w-32">
                  {reviewAppId ? (reviewGameName || `App ${reviewAppId}`) : t('header.allGames')}
                </span>
                <svg
                  className={`w-3 h-3 opacity-50 nasge-transition-quick ${gameOpen ? 'rotate-180' : ''}`}
                  viewBox="0 0 12 12" fill="none"
                >
                  <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {shouldRenderGame && (
                <div className={gameOpen ? "animate-dropdown-enter" : "animate-dropdown-exit"}>
                  <GameDropdown
                    games={gameList}
                    activeAppId={reviewAppId}
                    onSelect={(appId, name) => {
                      useReviewStore.getState().selectGame(appId, name);
                      setGameOpen(false);
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* 存档选择器 */}
          {showArchiveSelector && (
            <div ref={archiveRef} className="relative">
              <button
                type="button"
                onClick={() => setArchiveOpen(!archiveOpen)}
                className="
                  flex items-center gap-1.5 px-2.5 py-1.5
                  rounded-md border border-border-default
                  bg-transparent
                  text-xs text-text-secondary
                  hover:text-text-primary hover:border-border-accent hover:bg-accent-subtle
                  nasge-transition-quick cursor-pointer
                "
              >
                <span className="truncate max-w-32">
                  {currentArchive?.guideName || t('header.selectArchive')}
                </span>
                <svg
                  className={`w-3 h-3 opacity-50 nasge-transition-quick ${archiveOpen ? 'rotate-180' : ''}`}
                  viewBox="0 0 12 12" fill="none"
                >
                  <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {/* 存档下拉 */}
              {shouldRenderArchive && (
                <div className={archiveOpen ? "animate-dropdown-enter" : "animate-dropdown-exit"}>
                  <ArchiveDropdown
                    archives={archiveList}
                    activeId={currentArchiveId}
                    onSelect={(id) => { switchArchive(id); setArchiveOpen(false); }}
                    onManage={() => { setArchiveOpen(false); setManageModalVisible(true); }}
                  />
                </div>
              )}
            </div>
          )}

          {/* 设置按钮 */}
          <button
            type="button"
            data-tour="settings-button"
            onClick={() => setSettingsVisible(true)}
            className="
              w-8 h-8 flex items-center justify-center
              rounded-md border border-border-default
              bg-transparent text-text-muted
              hover:text-text-primary hover:border-border-accent hover:bg-accent-subtle
              nasge-transition-quick cursor-pointer
            "
            title={t('common:settings')}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      </header>

      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        onOpenChangelog={() => setChangelogVisible(true)}
      />
      <ArchiveManageModal visible={manageModalVisible} onClose={() => setManageModalVisible(false)} />
      <ChangelogModal visible={changelogVisible} onClose={handleChangelogClose} />
    </>
  );
};

// ============================================================================
// 存档下拉菜单
// ============================================================================

const ArchiveDropdown: React.FC<{
  archives: GuideArchive[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onManage: () => void;
}> = ({ archives, activeId, onSelect, onManage }) => {
  const { t } = useTranslation('editor');
  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });

  return (
    <div className="
      absolute top-[calc(100%+6px)] right-0 z-[1000]
      min-w-60 max-h-80 overflow-y-auto
      rounded-lg border border-border-accent
      bg-bg-surface shadow-xl
    ">
      <div className="p-1.5">
        {archives.map((a) => {
          const active = a.guideId === activeId;
          return (
            <button
              key={a.guideId}
              type="button"
              onClick={() => onSelect(a.guideId)}
              className={`
                w-full text-left px-3 py-2 rounded-md
                flex flex-col gap-0.5
                nasge-transition-quick cursor-pointer
                ${active
                  ? 'bg-accent-muted text-text-primary'
                  : 'bg-transparent text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                }
              `}
            >
              <span className="text-sm font-medium truncate flex items-center gap-1.5">
                {active && (
                  <svg className="w-3 h-3 text-accent shrink-0" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {a.guideName}
              </span>
              <span className="text-[11px] text-text-muted">
                {a.chapters.length} {t('header.chapters')} · {formatDate(a.lastAccessedAt)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="border-t border-border-default mx-1.5" />

      <div className="p-1.5">
        <button
          type="button"
          onClick={onManage}
          className="
            w-full px-3 py-2 rounded-md text-center
            text-xs text-accent
            bg-bg-overlay border border-border-default
            hover:bg-accent-subtle hover:border-border-accent
            nasge-transition-quick cursor-pointer
          "
        >
          {t('header.archiveManage')}
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// 游戏下拉菜单（离线评测）
// ============================================================================

const GameDropdown: React.FC<{
  games: { appId: string; name: string }[];
  activeAppId: string | null;
  onSelect: (appId: string | null, name?: string) => void;
}> = ({ games, activeAppId, onSelect }) => {
  const { t } = useTranslation('editor');
  return (
  <div className="
    absolute top-[calc(100%+6px)] right-0 z-[1000]
    min-w-52 max-h-80 overflow-y-auto
    rounded-lg border border-border-accent
    bg-bg-surface shadow-xl
  ">
    <div className="p-1.5">
      {/* 全部游戏 */}
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`
          w-full text-left px-3 py-2 rounded-md
          flex items-center gap-1.5
          nasge-transition-quick cursor-pointer
          ${!activeAppId
            ? 'bg-accent-muted text-text-primary'
            : 'bg-transparent text-text-secondary hover:bg-bg-hover hover:text-text-primary'
          }
        `}
      >
        {!activeAppId && (
          <svg className="w-3 h-3 text-accent shrink-0" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        <span className="text-sm">{t('header.allGames')}</span>
      </button>

      {games.map((g) => {
        const active = g.appId === activeAppId;
        return (
          <button
            key={g.appId}
            type="button"
            onClick={() => onSelect(g.appId, g.name)}
            className={`
              w-full text-left px-3 py-2 rounded-md
              flex items-center gap-1.5
              nasge-transition-quick cursor-pointer
              ${active
                ? 'bg-accent-muted text-text-primary'
                : 'bg-transparent text-text-secondary hover:bg-bg-hover hover:text-text-primary'
              }
            `}
          >
            {active && (
              <svg className="w-3 h-3 text-accent shrink-0" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            <span className="text-sm truncate">{g.name}</span>
          </button>
        );
      })}
    </div>
  </div>
  );
};

export default EditorHeader;
