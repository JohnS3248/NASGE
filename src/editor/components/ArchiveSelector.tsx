import React, { useState, useRef, useEffect } from 'react';
import { useGuideStore, type GuideArchive } from '../stores/useGuideStore';
import { ArchiveManageModal } from './ArchiveManageModal';

/**
 * 存档选择器 - 顶部下拉选择当前存档
 */
const ArchiveSelector: React.FC = () => {
  const {
    archives,
    currentArchiveId,
    switchArchive,
    getCurrentArchive
  } = useGuideStore();

  const [isOpen, setIsOpen] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentArchive = getCurrentArchive();
  const archiveList = Object.values(archives);

  // 点击外部关闭下拉框
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // 格式化时间 - 完整日期
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' });
  };

  // 切换存档
  const handleSelect = (guideId: string | null) => {
    switchArchive(guideId);
    setIsOpen(false);
  };

  // 如果没有存档，不显示选择器
  if (archiveList.length === 0) {
    return null;
  }

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* 触发按钮 */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 1rem',
          borderRadius: '0.5rem',
          border: '1px solid rgba(102, 192, 244, 0.3)',
          background: 'rgba(20, 35, 55, 0.7)',
          color: '#d7e8ff',
          fontSize: '0.85rem',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          minWidth: '160px',
          justifyContent: 'space-between'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(102, 192, 244, 0.15)';
          e.currentTarget.style.borderColor = 'rgba(102, 192, 244, 0.5)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(20, 35, 55, 0.7)';
          e.currentTarget.style.borderColor = 'rgba(102, 192, 244, 0.3)';
        }}
      >
        <span style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '140px'
        }}>
          📦 {currentArchive?.guideName || '选择存档'}
        </span>
        <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 0.5rem)',
            left: 0,
            minWidth: '280px',
            maxHeight: '400px',
            overflowY: 'auto',
            borderRadius: '0.6rem',
            border: '1px solid rgba(102, 192, 244, 0.3)',
            background: 'rgba(13, 23, 36, 0.98)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
            zIndex: 1000
          }}
        >
          {/* 存档列表 */}
          <div style={{ padding: '0.5rem' }}>
            {archiveList.map((archive) => (
              <ArchiveItem
                key={archive.guideId}
                archive={archive}
                isActive={archive.guideId === currentArchiveId}
                onSelect={() => handleSelect(archive.guideId)}
                formatTime={formatTime}
              />
            ))}
          </div>

          {/* 分隔线 */}
          <div style={{
            height: '1px',
            background: 'rgba(102, 192, 244, 0.15)',
            margin: '0.25rem 0'
          }} />

          {/* 管理按钮 */}
          <div style={{ padding: '0.5rem' }}>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setShowManageModal(true);
              }}
              style={{
                width: '100%',
                padding: '0.6rem 1rem',
                borderRadius: '0.4rem',
                border: 'none',
                background: 'transparent',
                color: '#66c0f4',
                fontSize: '0.85rem',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'background 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(102, 192, 244, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              ⚙️ 存档管理
            </button>
          </div>
        </div>
      )}

      {/* 存档管理弹窗 */}
      <ArchiveManageModal
        visible={showManageModal}
        onClose={() => setShowManageModal(false)}
      />
    </div>
  );
};

/**
 * 单个存档项
 */
const ArchiveItem: React.FC<{
  archive: GuideArchive;
  isActive: boolean;
  onSelect: () => void;
  formatTime: (timestamp: number) => string;
}> = ({ archive, isActive, onSelect, formatTime }) => {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        width: '100%',
        padding: '0.7rem 0.8rem',
        borderRadius: '0.4rem',
        border: isActive ? '1px solid rgba(102, 192, 244, 0.4)' : '1px solid transparent',
        background: isActive ? 'rgba(102, 192, 244, 0.15)' : 'transparent',
        color: '#d7e8ff',
        textAlign: 'left',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.3rem',
        transition: 'all 0.15s ease',
        marginBottom: '0.25rem'
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = 'transparent';
        }
      }}
    >
      {/* 指南名称 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: '0.9rem',
        fontWeight: isActive ? 600 : 400
      }}>
        {isActive && <span style={{ color: '#66c0f4' }}>✓</span>}
        <span style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {archive.guideName}
        </span>
      </div>

      {/* 统计信息 */}
      <div style={{
        display: 'flex',
        gap: '0.8rem',
        fontSize: '0.75rem',
        color: '#8aa4c7',
        paddingLeft: isActive ? '1.2rem' : 0
      }}>
        <span>{archive.chapters.length} 章节</span>
        <span>•</span>
        <span>访问于 {formatTime(archive.lastAccessedAt)}</span>
      </div>
    </button>
  );
};

export default ArchiveSelector;
