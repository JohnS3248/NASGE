import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGuideStore, type GuideArchive } from '../stores/useGuideStore';
import { useArchiveStore } from '../stores/useArchiveStore';
import { dialog } from '../stores/useDialogStore';
import { TrashIcon } from './ImageFloatingPanel/icons';
import { useMountTransition } from '../hooks/useMountTransition';

interface ArchiveManageModalProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * 存档管理弹窗 - 管理所有存档
 */
export const ArchiveManageModal: React.FC<ArchiveManageModalProps> = ({ visible, onClose }) => {
  const { t } = useTranslation('editor');
  const shouldRender = useMountTransition(visible, 150);
  const currentArchiveId = useGuideStore((s) => s.currentArchiveId);
  const switchArchive = useGuideStore((s) => s.switchArchive);
  const { archives, createArchive, deleteArchive } = useArchiveStore();

  const [isCreating, setIsCreating] = useState(false);
  const [newArchiveName, setNewArchiveName] = useState('');

  const archiveList = Object.values(archives);

  // 格式化完整日期
  const formatFullDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 创建离线存档
  const handleCreateOfflineArchive = () => {
    if (!newArchiveName.trim()) return;

    const offlineId = `offline-${Date.now()}`;
    createArchive(offlineId, {
      title: newArchiveName.trim(),
      coverUrl: '',
      chapters: []
    });

    // 切换到新创建的存档
    switchArchive(offlineId);

    setNewArchiveName('');
    setIsCreating(false);
  };

  // 删除存档（带确认）
  const handleDeleteArchive = async (archive: GuideArchive) => {
    const isOffline = archive.guideId.startsWith('offline-');
    const warningMsg = isOffline
      ? t('archive.deleteOfflineConfirm', { name: archive.guideName })
      : t('archive.deleteConfirm', { name: archive.guideName });

    if (await dialog.confirm({ message: warningMsg, danger: true })) {
      deleteArchive(archive.guideId);
    }
  };

  if (!shouldRender) return null;

  return (
    <div
      className={`fixed inset-0 bg-black/60 flex items-center justify-center z-[10000] ${
        visible ? "animate-modal-backdrop" : "opacity-0 transition-opacity duration-[150ms]"
      }`}
      onClick={onClose}
    >
      <div
        className={`bg-[rgba(13,23,36,0.98)] border border-accent/30 rounded-xl p-6 w-[480px] max-h-[80vh] flex flex-col shadow-2xl ${
          visible ? "animate-modal-enter" : "opacity-0 scale-95 transition-all duration-[150ms]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex justify-between items-center mb-5 pb-3 border-b border-border-default">
          <h2 className="m-0 text-xl font-semibold text-text-primary">
            {t('archive.manage')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="bg-transparent border-0 text-text-secondary text-xl cursor-pointer p-1 hover:text-text-primary nasge-transition-quick"
          >
            ✕
          </button>
        </div>

        {/* 存档统计 */}
        <div className="text-[0.85rem] text-text-secondary mb-4">
          {t('archive.count', { count: archiveList.length })}
        </div>

        {/* 存档列表 */}
        <div className="flex-1 overflow-y-auto mb-4 flex flex-col gap-2">
          {archiveList.length === 0 ? (
            <div className="py-8 text-center text-text-muted text-[0.9rem]">
              {t('archive.noArchives')}
            </div>
          ) : (
            archiveList.map((archive) => (
              <ArchiveListItem
                key={archive.guideId}
                archive={archive}
                isActive={archive.guideId === currentArchiveId}
                onSelect={() => {
                  switchArchive(archive.guideId);
                  onClose();
                }}
                onDelete={() => handleDeleteArchive(archive)}
                formatDate={formatFullDate}
              />
            ))
          )}
        </div>

        {/* 新建离线存档区域 */}
        <div className="border-t border-border-default pt-4">
          {isCreating ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={newArchiveName}
                onChange={(e) => setNewArchiveName(e.target.value)}
                placeholder={t('archive.namePlaceholder')}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateOfflineArchive();
                  if (e.key === 'Escape') {
                    setIsCreating(false);
                    setNewArchiveName('');
                  }
                }}
                className="flex-1 px-3 py-2.5 rounded-md border border-accent/40 bg-bg-input text-text-primary text-[0.9rem] outline-none focus:border-accent nasge-transition-quick"
              />
              <button
                type="button"
                onClick={handleCreateOfflineArchive}
                disabled={!newArchiveName.trim()}
                className={`px-4 py-2.5 rounded-md border-0 font-semibold text-[0.85rem] ${
                  newArchiveName.trim()
                    ? 'bg-accent text-bg-app cursor-pointer hover:bg-accent-hover'
                    : 'bg-accent/30 text-text-muted cursor-not-allowed'
                } nasge-transition-quick`}
              >
                {t('common:create')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  setNewArchiveName('');
                }}
                className="px-3 py-2.5 rounded-md border border-danger/40 bg-transparent text-danger cursor-pointer text-[0.85rem] hover:bg-danger/10 nasge-transition-quick"
              >
                {t('common:cancel')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="w-full py-3 px-4 rounded-lg border border-dashed border-accent/40 bg-transparent text-accent text-[0.9rem] cursor-pointer hover:bg-accent/10 hover:border-solid nasge-transition-quick"
            >
              {t('archive.createOffline')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * 存档列表项
 */
const ArchiveListItem: React.FC<{
  archive: GuideArchive;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  formatDate: (timestamp: number) => string;
}> = ({ archive, isActive, onSelect, onDelete, formatDate }) => {
  const { t } = useTranslation('editor');
  const isOffline = archive.guideId.startsWith('offline-');

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border nasge-transition-quick ${
        isActive
          ? 'border-accent/40 bg-accent/10'
          : 'border-border-default bg-[rgba(8,14,23,0.5)] hover:border-border-accent hover:bg-bg-hover'
      }`}
    >
      {/* 封面或图标 */}
      <div className="w-12 h-12 rounded-md overflow-hidden shrink-0 bg-[rgba(20,35,55,0.7)] flex items-center justify-center">
        {archive.coverUrl ? (
          <img
            src={archive.coverUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : isOffline ? (
          <svg className="w-6 h-6 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
          </svg>
        ) : (
          <svg className="w-6 h-6 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" />
          </svg>
        )}
      </div>

      {/* 信息区域 */}
      <div
        className="flex-1 cursor-pointer min-w-0"
        onClick={onSelect}
      >
        <div className="flex items-center gap-2 mb-1">
          {isActive && (
            <svg className="w-3.5 h-3.5 text-accent shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          )}
          <span className={`text-[0.95rem] text-text-primary truncate ${isActive ? 'font-semibold' : 'font-normal'}`}>
            {archive.guideName}
          </span>
          {isOffline && (
            <span className="px-1.5 py-0.5 rounded text-[0.65rem] font-medium bg-warning/20 text-warning">
              {t('common:offline')}
            </span>
          )}
        </div>
        <div className="text-xs text-text-muted flex gap-2.5">
          <span>{archive.chapters.length} {t('header.chapters')}</span>
          <span>•</span>
          <span>{t('archive.createdAt', { date: formatDate(archive.createdAt) })}</span>
        </div>
      </div>

      {/* 删除按钮 */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title={t('common:delete')}
        className="w-8 h-8 rounded-md border-0 bg-transparent text-text-muted cursor-pointer flex items-center justify-center text-[0.9rem] hover:bg-danger/15 hover:text-danger nasge-transition-quick"
      >
        <TrashIcon size={16} />
      </button>
    </div>
  );
};

export default ArchiveManageModal;
