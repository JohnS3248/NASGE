import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useGuideStore, type GuideArchive } from '../stores/useGuideStore';
import { SettingsModal } from './SettingsModal';
import { ArchiveManageModal } from './ArchiveManageModal';

// ============================================================================
// 模式配置
// ============================================================================

const MODE_CONFIG = {
  guide:   { label: '指南模式', dot: 'bg-accent' },
  review:  { label: '评测模式', dot: 'bg-warning' },
  offline: { label: '离线模式', dot: 'bg-text-muted' },
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
  const mode = useGuideStore((s) => s.mode);
  const guideInfo = useGuideStore((s) => s.guideInfo);
  const archives = useGuideStore((s) => s.archives);
  const currentArchiveId = useGuideStore((s) => s.currentArchiveId);
  const switchArchive = useGuideStore((s) => s.switchArchive);
  const getCurrentArchive = useGuideStore((s) => s.getCurrentArchive);

  const [settingsVisible, setSettingsVisible] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [manageModalVisible, setManageModalVisible] = useState(false);
  const archiveRef = useRef<HTMLDivElement>(null);

  const currentArchive = getCurrentArchive();
  const archiveList = Object.values(archives);
  const modeConf = MODE_CONFIG[mode] ?? MODE_CONFIG.guide;

  // 存档下拉外部点击关闭
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (archiveRef.current && !archiveRef.current.contains(e.target as Node)) {
      setArchiveOpen(false);
    }
  }, []);

  useEffect(() => {
    if (archiveOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [archiveOpen, handleClickOutside]);

  // 模式描述
  const subtitle = mode === 'guide' && guideInfo
    ? `ID ${guideInfo.id} · ${guideInfo.chapters.length} 个章节`
    : mode === 'review'
    ? '编辑 Steam 评测内容'
    : '离线编辑模式 - 不关联任何 Steam 内容';

  // 是否显示存档选择器（指南模式绑定 Steam 页面，不允许切换）
  const showArchiveSelector = mode !== 'guide' && archiveList.length > 0;

  return (
    <>
      <header className="
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
            <span className={`w-1.5 h-1.5 rounded-full ${modeConf.dot}`} />
            {modeConf.label}
          </span>

          <BreadcrumbSep />

          {/* 指南标题 / 描述 */}
          <span className="text-sm text-text-primary truncate" title={subtitle}>
            {guideInfo?.title || subtitle}
          </span>

          {/* 章节数（指南模式下显示） */}
          {mode === 'guide' && guideInfo && (
            <span className="text-xs text-text-muted ml-1.5 shrink-0">
              · {guideInfo.chapters.length} 章
            </span>
          )}
        </div>

        {/* 右侧：存档选择器 + 设置 */}
        <div className="flex items-center gap-2 shrink-0">
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
                  {currentArchive?.guideName || '选择存档'}
                </span>
                <svg
                  className={`w-3 h-3 opacity-50 nasge-transition-quick ${archiveOpen ? 'rotate-180' : ''}`}
                  viewBox="0 0 12 12" fill="none"
                >
                  <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {/* 存档下拉 */}
              {archiveOpen && (
                <ArchiveDropdown
                  archives={archiveList}
                  activeId={currentArchiveId}
                  onSelect={(id) => { switchArchive(id); setArchiveOpen(false); }}
                  onManage={() => { setArchiveOpen(false); setManageModalVisible(true); }}
                />
              )}
            </div>
          )}

          {/* 设置按钮 */}
          <button
            type="button"
            onClick={() => setSettingsVisible(true)}
            className="
              w-8 h-8 flex items-center justify-center
              rounded-md border border-border-default
              bg-transparent text-text-muted
              hover:text-text-primary hover:border-border-accent hover:bg-accent-subtle
              nasge-transition-quick cursor-pointer
            "
            title="设置"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      </header>

      <SettingsModal visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
      <ArchiveManageModal visible={manageModalVisible} onClose={() => setManageModalVisible(false)} />
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
  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });

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
                {a.chapters.length} 章节 · {formatDate(a.lastAccessedAt)}
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
            hover:bg-accent-subtle
            nasge-transition-quick cursor-pointer
          "
        >
          存档管理
        </button>
      </div>
    </div>
  );
};

export default EditorHeader;
