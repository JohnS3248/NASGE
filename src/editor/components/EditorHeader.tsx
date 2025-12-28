import React, { useState } from 'react';
import { useGuideStore } from '../stores/useGuideStore';
import { SettingsModal } from './SettingsModal';
import ArchiveSelector from './ArchiveSelector';

const EditorHeader: React.FC = () => {
  const { mode, guideInfo } = useGuideStore();
  const [settingsVisible, setSettingsVisible] = useState(false);

  const getModeLabel = () => {
    switch (mode) {
      case 'guide':
        return '指南模式';
      case 'review':
        return '评测模式';
      case 'offline':
        return '离线模式';
      default:
        return '未知模式';
    }
  };

  const getModeColor = () => {
    switch (mode) {
      case 'guide':
        return 'rgba(102, 192, 244, 0.9)';
      case 'review':
        return 'rgba(255, 193, 7, 0.9)';
      case 'offline':
        return 'rgba(158, 158, 158, 0.9)';
      default:
        return 'rgba(102, 192, 244, 0.9)';
    }
  };

  return (
    <>
      <header
        style={{
          borderRadius: '1.05rem',
          background: 'rgba(13, 23, 36, 0.9)',
          border: '1px solid rgba(102, 192, 244, 0.25)',
          padding: '1.2rem 1.6rem',
          boxShadow: '0 24px 40px rgba(10, 18, 30, 0.45)',
          display: 'flex',
          alignItems: 'center',
          gap: '1.5rem'
        }}
      >
      {/* 封面图 */}
      {guideInfo?.coverUrl && (
        <div
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '0.5rem',
            overflow: 'hidden',
            flexShrink: 0,
            border: '1px solid rgba(102, 192, 244, 0.3)'
          }}
        >
          <img
            src={guideInfo.coverUrl}
            alt="Guide Cover"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }}
          />
        </div>
      )}

      {/* 标题和信息 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1
            style={{
              margin: 0,
              fontSize: '1.5rem',
              fontWeight: 700,
              color: '#f6fbff',
              textShadow: '0 2px 8px rgba(7, 14, 23, 0.5)'
            }}
          >
            {guideInfo?.title || 'NASGE 编辑器'}
          </h1>
          <span
            style={{
              padding: '0.3rem 0.8rem',
              borderRadius: '0.4rem',
              background: getModeColor(),
              color: '#fff',
              fontSize: '0.75rem',
              fontWeight: 600,
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.2)'
            }}
          >
            {getModeLabel()}
          </span>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: '0.85rem',
            lineHeight: 1.6,
            color: '#a4bedc'
          }}
        >
          {mode === 'guide' && guideInfo
            ? `指南 ID: ${guideInfo.id} • ${guideInfo.chapters.length} 个章节`
            : mode === 'review'
            ? '编辑 Steam 评测内容'
            : '离线编辑模式 - 不关联任何 Steam 内容'}
        </p>
      </div>

      {/* 存档选择器 */}
      <ArchiveSelector />

      {/* 设置按钮 */}
      <button
        type="button"
        onClick={() => setSettingsVisible(true)}
        style={{
          flexShrink: 0,
          width: '42px',
          height: '42px',
          border: '1px solid rgba(102, 192, 244, 0.3)',
          background: 'rgba(20, 35, 55, 0.7)',
          borderRadius: '0.6rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.2rem',
          color: 'rgba(205, 226, 255, 0.85)',
          transition: 'all 0.2s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(102, 192, 244, 0.15)';
          e.currentTarget.style.borderColor = 'rgba(102, 192, 244, 0.5)';
          e.currentTarget.style.color = '#e5f3ff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(20, 35, 55, 0.7)';
          e.currentTarget.style.borderColor = 'rgba(102, 192, 244, 0.3)';
          e.currentTarget.style.color = 'rgba(205, 226, 255, 0.85)';
        }}
        title="设置"
      >
        ⚙️
      </button>
    </header>

    <SettingsModal
      visible={settingsVisible}
      onClose={() => setSettingsVisible(false)}
    />
    </>
  );
};

export default EditorHeader;
