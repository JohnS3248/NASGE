import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useGuideStore, isReviewMode } from '../stores/useGuideStore';
import { useDraftStore } from '../stores/useDraftStore';
import { useArchiveStore } from '../stores/useArchiveStore';
import { useReviewStore } from '../stores/useReviewStore';
import { extractTitleText } from '../utils/titleHelpers';
import { dialog } from '../stores/useDialogStore';
import { useMountTransition } from '../hooks/useMountTransition';

// ============================================================================
// Types & Helpers
// ============================================================================

type DraftItem = ReturnType<typeof useDraftStore.getState>['drafts'][number];

const formatDate = (ts: number) =>
  new Date(ts).toLocaleString(undefined, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const getDraftDisplayTitle = (draft: DraftItem | undefined) => {
  if (!draft) return '';
  const titleText = extractTitleText(draft.title);
  if (titleText) return titleText;
  return draft.draftName;
};

/** 获取草稿副标题：归属信息（指南名 / 游戏名） */
const getDraftSubtitle = (draft: DraftItem): string => {
  // 指南草稿：显示所属指南名
  if (draft.linkedGuideId) {
    const archive = useArchiveStore.getState().archives[draft.linkedGuideId];
    if (archive?.guideName) return archive.guideName;
  }
  // 评测草稿：显示游戏名
  if (draft.draftType === 'review' && draft.linkedAppName) {
    return draft.linkedAppName;
  }
  return draft.draftName;
};

// 蓝色按钮样式（跟"导出草稿"风格一致：bg-accent/15 + text-accent + border-accent/30）
const btnAccent = `
  px-2.5 py-1 text-xs rounded-md
  bg-accent/15 border border-accent/30 text-accent
  hover:bg-accent/25 hover:text-accent-hover hover:border-accent/50
  nasge-transition-quick cursor-pointer
`;

const btnDanger = `
  px-2.5 py-1 text-xs rounded-md
  bg-danger/15 border border-danger/30 text-danger
  hover:bg-danger/25 hover:border-danger/50
  nasge-transition-quick cursor-pointer
  disabled:opacity-40 disabled:cursor-not-allowed
`;

// ============================================================================
// SVG Icons (Lucide)
// ============================================================================

const ChevronIcon: React.FC<{ expanded: boolean; className?: string }> = ({ expanded, className = '' }) => (
  <svg
    className={`w-3.5 h-3.5 shrink-0 nasge-transition-quick ${expanded ? 'rotate-90' : ''} ${className}`}
    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

const CheckIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={`w-3.5 h-3.5 shrink-0 ${className}`} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const PlusIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={`w-3.5 h-3.5 ${className}`} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14" /><path d="M12 5v14" />
  </svg>
);

const EllipsisIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={`w-4 h-4 ${className}`} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
  </svg>
);

// ============================================================================
// DraftContextMenu — ··· 弹出菜单
// ============================================================================

const DraftContextMenu: React.FC<{
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  floatingRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}> = ({ anchorRef, floatingRef, onClose, onRename, onDuplicate, onDelete }) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (anchorRef.current && floatingRef.current) {
      const btnRect = anchorRef.current.getBoundingClientRect();
      const panelRect = floatingRef.current.getBoundingClientRect();
      setPosition({
        top: btnRect.bottom - panelRect.top + 4,
        right: panelRect.right - btnRect.right,
      });
    }
  }, [anchorRef, floatingRef]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose, anchorRef]);

  if (!position) return null;

  const menuItemClass = `w-full text-left ${btnAccent}`;

  return (
    <div
      ref={menuRef}
      className="absolute z-[60] min-w-[140px] py-1 rounded-lg border border-border-accent bg-bg-overlay shadow-xl flex flex-col gap-1 px-1"
      style={{ top: position.top, right: position.right }}
    >
      <button type="button" onClick={() => { onRename(); onClose(); }}
        className={menuItemClass}>
        {t("rename")}
      </button>
      <button type="button" onClick={() => { onDuplicate(); onClose(); }}
        className={menuItemClass}>
        {t("copy")}
      </button>
      <div className="mx-1 border-t border-border-default" />
      <button type="button" onClick={() => { onDelete(); onClose(); }}
        className={`w-full text-left ${btnDanger}`}>
        {t("delete")}
      </button>
    </div>
  );
};

// ============================================================================
// DraftPanel — 主组件
// ============================================================================

const DraftPanel: React.FC = () => {
  const { t } = useTranslation('editor');
  const {
    drafts,
    activeDraftId,
    selectDraft,
    addDraft,
    updateDraft,
    deleteDraft,
    duplicateDraft,
  } = useDraftStore();

  const currentArchiveId = useGuideStore((s) => s.currentArchiveId);
  const mode = useGuideStore((s) => s.mode);
  const currentArchive = useArchiveStore((s) => currentArchiveId ? s.archives[currentArchiveId] : undefined);
  const reviewAppId = useReviewStore((s) => s.appId);

  const [isExpanded, setIsExpanded] = useState(false);
  const shouldRenderDropdown = useMountTransition(isExpanded, 100);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const floatingRef = useRef<HTMLDivElement>(null);

  const displayedDrafts = useMemo(() => {
    const inReview = isReviewMode(mode);

    if (inReview) {
      const reviewDrafts = drafts.filter((d) => d.draftType === 'review');
      // 有 appId → 只显示该游戏的草稿（在线/离线均适用）
      if (reviewAppId) {
        return reviewDrafts.filter((d) => d.linkedAppId === reviewAppId);
      }
      return reviewDrafts;
    }

    // guide 模式：按存档过滤
    const guideFiltered = drafts.filter((d) => d.draftType !== 'review');
    if (!currentArchiveId) {
      return guideFiltered.filter((d) => !d.linkedGuideId);
    }
    return guideFiltered.filter((d) => d.linkedGuideId === currentArchiveId);
  }, [drafts, currentArchiveId, mode, reviewAppId]);

  const activeDraft = drafts.find((d) => d.id === activeDraftId);

  // ---- 操作处理 ----

  const handleSelectDraft = useCallback((id: string) => {
    selectDraft(id);
    setIsExpanded(false);
  }, [selectDraft]);

  const handleAddDraft = useCallback(async () => {
    const { nextDraftNumber } = useDraftStore.getState();
    const defaultName = t('draft.newName', { number: nextDraftNumber });
    const name = await dialog.prompt({ message: t('draft.newDialog'), defaultValue: defaultName });
    if (name === null) return;

    const finalName = name.trim() || defaultName;
    const inReview = isReviewMode(mode);
    const reviewState = useReviewStore.getState();

    const newDraft = addDraft({
      draftName: finalName,
      draftType: inReview ? 'review' : 'guide',
      linkedGuideId: inReview ? undefined : (currentArchiveId ?? undefined),
      linkedAppId: inReview ? (reviewState.appId ?? undefined) : undefined,
      linkedAppName: inReview ? (reviewState.gameName || undefined) : undefined,
    });
    if (newDraft) selectDraft(newDraft.id);
  }, [addDraft, selectDraft, mode, currentArchiveId]);

  const handleRename = useCallback(async (id: string, currentName: string) => {
    const newName = await dialog.prompt({ message: t('draft.renameDialog'), defaultValue: currentName });
    if (newName && newName.trim()) {
      updateDraft(id, { draftName: newName.trim() });
    }
  }, [updateDraft]);

  const handleDuplicate = useCallback((id: string) => {
    const newDraft = duplicateDraft(id);
    if (newDraft) selectDraft(newDraft.id);
  }, [duplicateDraft, selectDraft]);

  const handleDelete = useCallback(async (id: string, name: string) => {
    if (await dialog.confirm({ message: t('draft.deleteConfirm', { name }), danger: true })) {
      deleteDraft(id);
    }
  }, [deleteDraft]);

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    if (await dialog.confirm({ message: t('draft.batchDeleteConfirm', { count: selectedIds.size }), danger: true })) {
      selectedIds.forEach((id) => deleteDraft(id));
      setSelectedIds(new Set());
      setBatchMode(false);
    }
  }, [selectedIds, deleteDraft]);

  const exitBatchMode = useCallback(() => {
    setBatchMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleBatchSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ---- 点击外部关闭 ----

  useEffect(() => {
    if (!isExpanded) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsExpanded(false);
        exitBatchMode();
        setMenuOpenId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isExpanded, exitBatchMode]);

  // ---- 渲染 ----

  return (
    <div data-draft-panel ref={panelRef} className="relative">
      {/* 触发器 bar — 始终可见，样式不变 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => { if (isExpanded) { exitBatchMode(); setMenuOpenId(null); } setIsExpanded(!isExpanded); }}
          className="
            flex items-center gap-2 px-3 py-2
            rounded-lg border border-border-default bg-bg-surface
            text-sm text-text-secondary
            hover:border-border-accent hover:bg-bg-hover hover:text-text-primary
            nasge-transition-quick cursor-pointer
          "
        >
          <ChevronIcon expanded={isExpanded} className="text-text-secondary" />

          {activeDraft ? (
            <span className="flex items-center gap-1.5 truncate">
              <span className="font-medium text-text-primary truncate">
                {getDraftDisplayTitle(activeDraft)}
              </span>
              <span className="text-xs text-text-secondary">· {getDraftSubtitle(activeDraft)}</span>
            </span>
          ) : (
            <span className="text-text-secondary">{t('draft.noSelected')}</span>
          )}
        </button>

        <span className="text-xs text-text-muted">
          {displayedDrafts.length} {t('draft.count')}
        </span>
      </div>

      {/* 悬浮面板 */}
      {shouldRenderDropdown && (
        <div ref={floatingRef} className={`absolute top-[calc(100%+6px)] left-0 z-50 min-w-80 max-w-[450px] rounded-lg border border-border-accent bg-bg-surface shadow-xl ${
          isExpanded ? "animate-dropdown-enter" : "animate-dropdown-exit"
        }`}>
          {/* 工具栏 */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border-default">
            {batchMode ? (
              <>
                <button type="button" onClick={exitBatchMode} className={btnAccent}>
                  {t('common:cancel')}
                </button>
                <div className="flex-1" />
                <button type="button" onClick={handleBatchDelete}
                  disabled={selectedIds.size === 0} className={btnDanger}>
                  {t('draft.deleteSelected')}{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => { setBatchMode(true); setMenuOpenId(null); }}
                  className={btnAccent}>
                  {t('draft.batchManage')}
                </button>
                <div className="flex-1" />
                <button type="button" onClick={handleAddDraft}
                  className={`${btnAccent} flex items-center gap-1`}>
                  <PlusIcon className="w-3 h-3" />
                  {t('draft.new')}
                </button>
              </>
            )}
          </div>

          {/* 草稿列表 */}
          <div className="max-h-72 overflow-y-auto p-1.5">
            {displayedDrafts.length === 0 ? (
              <div className="py-6 text-center text-text-muted text-xs">
                {isReviewMode(mode)
                  ? t('draft.noReviewDrafts')
                  : currentArchive?.guideName
                    ? t('draft.noDrafts', { name: currentArchive.guideName })
                    : t('draft.startEditing')}
              </div>
            ) : (
              displayedDrafts.map((draft) => {
                const isActive = activeDraftId === draft.id;
                const isSelected = selectedIds.has(draft.id);

                return (
                  <div
                    key={draft.id}
                    className={`
                      group flex items-center gap-2 px-3 py-2 rounded-md
                      nasge-transition-quick
                      ${isActive && !batchMode
                        ? 'bg-accent-muted text-text-primary'
                        : 'bg-transparent text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                      }
                      ${batchMode ? '' : 'cursor-pointer'}
                    `}
                    onClick={batchMode ? undefined : () => handleSelectDraft(draft.id)}
                  >
                    {/* 左侧：批量 checkbox 或 选中 checkmark */}
                    {batchMode ? (
                      <button
                        type="button"
                        onClick={() => toggleBatchSelect(draft.id)}
                        className={`
                          w-4 h-4 shrink-0 rounded border nasge-transition-quick cursor-pointer
                          flex items-center justify-center
                          ${isSelected
                            ? 'bg-accent border-accent text-white'
                            : 'border-text-muted bg-transparent hover:border-accent'
                          }
                        `}
                      >
                        {isSelected && (
                          <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        )}
                      </button>
                    ) : (
                      isActive && <CheckIcon className="text-accent" />
                    )}

                    {/* 草稿信息 */}
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <span className="text-sm font-medium truncate">
                        {getDraftDisplayTitle(draft)}
                      </span>
                      <span className="text-[11px] text-text-muted">
                        {getDraftSubtitle(draft)}
                        {' · '}{formatDate(draft.updatedAt)}
                      </span>
                    </div>

                    {/* ··· 菜单按钮 */}
                    {!batchMode && (
                      <button
                        type="button"
                        ref={menuOpenId === draft.id ? menuAnchorRef : undefined}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(menuOpenId === draft.id ? null : draft.id);
                        }}
                        className={`shrink-0 p-1 rounded-md nasge-transition-quick cursor-pointer ${btnAccent}`}
                      >
                        <EllipsisIcon />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* ··· 上下文菜单 */}
          {menuOpenId && (() => {
            const menuDraft = displayedDrafts.find((d) => d.id === menuOpenId);
            if (!menuDraft) return null;
            return (
              <DraftContextMenu
                anchorRef={menuAnchorRef}
                floatingRef={floatingRef}
                onClose={() => setMenuOpenId(null)}
                onRename={() => handleRename(menuDraft.id, menuDraft.draftName)}
                onDuplicate={() => handleDuplicate(menuDraft.id)}
                onDelete={() => handleDelete(menuDraft.id, menuDraft.draftName)}
              />
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default DraftPanel;
