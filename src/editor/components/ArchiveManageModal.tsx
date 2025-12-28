import React, { useState } from 'react';
import { useGuideStore, type GuideArchive } from '../stores/useGuideStore';

interface ArchiveManageModalProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * 存档管理弹窗 - 管理所有存档
 */
export const ArchiveManageModal: React.FC<ArchiveManageModalProps> = ({ visible, onClose }) => {
  const {
    archives,
    currentArchiveId,
    createArchive,
    deleteArchive,
    switchArchive
  } = useGuideStore();

  const [isCreating, setIsCreating] = useState(false);
  const [newArchiveName, setNewArchiveName] = useState('');

  const archiveList = Object.values(archives);

  // 格式化完整日期
  const formatFullDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('zh-CN', {
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
      id: offlineId,
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
  const handleDeleteArchive = (archive: GuideArchive) => {
    const isOffline = archive.guideId.startsWith('offline-');
    const warningMsg = isOffline
      ? `确定要删除离线存档"${archive.guideName}"吗？\n\n该存档下的所有草稿将变为未关联状态。`
      : `确定要删除存档"${archive.guideName}"吗？\n\n注意：这只会删除本地缓存，不会影响 Steam 上的原始指南。该存档下的所有草稿将变为未关联状态。`;

    if (window.confirm(warningMsg)) {
      deleteArchive(archive.guideId);
    }
  };

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'rgba(13, 23, 36, 0.98)',
          border: '1px solid rgba(102, 192, 244, 0.3)',
          borderRadius: '1rem',
          padding: '1.5rem',
          width: '480px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.5)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.2rem',
          paddingBottom: '0.8rem',
          borderBottom: '1px solid rgba(102, 192, 244, 0.15)'
        }}>
          <h2 style={{
            margin: 0,
            fontSize: '1.2rem',
            fontWeight: 600,
            color: '#f6fbff'
          }}>
            📦 存档管理
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8aa4c7',
              fontSize: '1.2rem',
              cursor: 'pointer',
              padding: '0.25rem'
            }}
          >
            ✕
          </button>
        </div>

        {/* 存档统计 */}
        <div style={{
          fontSize: '0.85rem',
          color: '#8aa4c7',
          marginBottom: '1rem'
        }}>
          共 {archiveList.length} 个存档
        </div>

        {/* 存档列表 */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          marginBottom: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem'
        }}>
          {archiveList.length === 0 ? (
            <div style={{
              padding: '2rem',
              textAlign: 'center',
              color: '#6b7f9a',
              fontSize: '0.9rem'
            }}>
              暂无存档，访问 Steam 指南或创建离线存档
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
        <div style={{
          borderTop: '1px solid rgba(102, 192, 244, 0.15)',
          paddingTop: '1rem'
        }}>
          {isCreating ? (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                value={newArchiveName}
                onChange={(e) => setNewArchiveName(e.target.value)}
                placeholder="输入存档名称..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateOfflineArchive();
                  if (e.key === 'Escape') {
                    setIsCreating(false);
                    setNewArchiveName('');
                  }
                }}
                style={{
                  flex: 1,
                  padding: '0.6rem 0.8rem',
                  borderRadius: '0.4rem',
                  border: '1px solid rgba(102, 192, 244, 0.4)',
                  background: 'rgba(8, 14, 23, 0.8)',
                  color: '#d7e8ff',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              />
              <button
                type="button"
                onClick={handleCreateOfflineArchive}
                disabled={!newArchiveName.trim()}
                style={{
                  padding: '0.6rem 1rem',
                  borderRadius: '0.4rem',
                  border: 'none',
                  background: newArchiveName.trim()
                    ? 'linear-gradient(135deg, rgba(102, 192, 244, 0.9), rgba(66, 139, 202, 0.9))'
                    : 'rgba(102, 192, 244, 0.3)',
                  color: newArchiveName.trim() ? '#06101e' : '#6b7f9a',
                  fontWeight: 600,
                  cursor: newArchiveName.trim() ? 'pointer' : 'not-allowed',
                  fontSize: '0.85rem'
                }}
              >
                创建
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  setNewArchiveName('');
                }}
                style={{
                  padding: '0.6rem 0.8rem',
                  borderRadius: '0.4rem',
                  border: '1px solid rgba(255, 128, 128, 0.4)',
                  background: 'transparent',
                  color: '#ff8080',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                取消
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              style={{
                width: '100%',
                padding: '0.7rem 1rem',
                borderRadius: '0.5rem',
                border: '1px dashed rgba(102, 192, 244, 0.4)',
                background: 'transparent',
                color: '#66c0f4',
                fontSize: '0.9rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(102, 192, 244, 0.1)';
                e.currentTarget.style.borderStyle = 'solid';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderStyle = 'dashed';
              }}
            >
              + 新建离线存档
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
  const isOffline = archive.guideId.startsWith('offline-');

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.8rem',
        padding: '0.8rem',
        borderRadius: '0.5rem',
        border: isActive ? '1px solid rgba(102, 192, 244, 0.4)' : '1px solid rgba(102, 192, 244, 0.15)',
        background: isActive ? 'rgba(102, 192, 244, 0.1)' : 'rgba(8, 14, 23, 0.5)',
        transition: 'all 0.15s ease'
      }}
    >
      {/* 封面或图标 */}
      <div style={{
        width: '48px',
        height: '48px',
        borderRadius: '0.4rem',
        overflow: 'hidden',
        flexShrink: 0,
        background: 'rgba(20, 35, 55, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {archive.coverUrl ? (
          <img
            src={archive.coverUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ fontSize: '1.5rem' }}>
            {isOffline ? '📝' : '📦'}
          </span>
        )}
      </div>

      {/* 信息区域 */}
      <div
        style={{ flex: 1, cursor: 'pointer', minWidth: 0 }}
        onClick={onSelect}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '0.25rem'
        }}>
          {isActive && <span style={{ color: '#66c0f4', fontSize: '0.8rem' }}>✓</span>}
          <span style={{
            fontSize: '0.95rem',
            fontWeight: isActive ? 600 : 400,
            color: '#d7e8ff',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {archive.guideName}
          </span>
          {isOffline && (
            <span style={{
              padding: '0.1rem 0.4rem',
              borderRadius: '0.25rem',
              background: 'rgba(255, 193, 7, 0.2)',
              color: '#FFC107',
              fontSize: '0.65rem',
              fontWeight: 500
            }}>
              离线
            </span>
          )}
        </div>
        <div style={{
          fontSize: '0.75rem',
          color: '#6b7f9a',
          display: 'flex',
          gap: '0.6rem'
        }}>
          <span>{archive.chapters.length} 章节</span>
          <span>•</span>
          <span>创建于 {formatDate(archive.createdAt)}</span>
        </div>
      </div>

      {/* 删除按钮 */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="删除存档"
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '0.4rem',
          border: 'none',
          background: 'transparent',
          color: '#6b7f9a',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.9rem',
          transition: 'all 0.15s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 128, 128, 0.15)';
          e.currentTarget.style.color = '#ff8080';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = '#6b7f9a';
        }}
      >
        🗑️
      </button>
    </div>
  );
};

export default ArchiveManageModal;
