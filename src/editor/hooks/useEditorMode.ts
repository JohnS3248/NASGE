import { useEffect, useCallback, useState } from 'react';
import { useGuideStore, type EditorMode } from '../stores/useGuideStore';
import { fetchGuideInfo } from '../services/guideInfo';

/**
 * 根据 URL 参数初始化编辑器模式和指南信息
 */
export function useEditorMode() {
  const { mode, setMode, setGuideInfo, guideInfo } = useGuideStore();
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlMode = params.get('mode') as EditorMode | null;
    const guideId = params.get('guideId');

    console.log('[NASGE Editor] URL 参数', { urlMode, guideId });

    // 设置模式（仅当模式不同时）
    if (urlMode && (urlMode === 'guide' || urlMode === 'review' || urlMode === 'offline')) {
      if (mode !== urlMode) {
        setMode(urlMode);
        console.log('[NASGE Editor] 设置模式:', urlMode);
      } else {
        console.log('[NASGE Editor] 模式已是:', urlMode, '无需更新');
      }
    }

    // 如果是指南模式且有 guideId，自动拉取指南信息
    if (urlMode === 'guide' && guideId) {
      console.log('[NASGE Editor] 开始导入指南信息', { guideId });

      // 添加重试逻辑，处理 content script 未就绪的情况
      const fetchWithRetry = async (retries = 3, delay = 500) => {
        for (let i = 0; i < retries; i++) {
          try {
            const info = await fetchGuideInfo(guideId);
            console.log('[NASGE Editor] 指南信息导入成功', info);
            setGuideInfo(info);
            return;
          } catch (error) {
            const isConnectionError = error instanceof Error &&
              error.message.includes('Could not establish connection');

            if (isConnectionError && i < retries - 1) {
              console.warn(`[NASGE Editor] 指南信息导入失败，${delay}ms 后重试 (${i + 1}/${retries})`, error);
              await new Promise(resolve => setTimeout(resolve, delay));
              // 指数退避：每次重试延迟加倍
              delay *= 2;
            } else {
              console.error('[NASGE Editor] 指南信息导入失败', error);
              // TODO: 显示错误提示给用户
              return; // 不要 throw，避免未处理的 Promise rejection
            }
          }
        }
      };

      fetchWithRetry().catch((error) => {
        // 最终失败，已经记录了错误
        console.error('[NASGE Editor] fetchWithRetry 最终失败', error);
      });
    }
  }, [setMode, setGuideInfo]);

  /**
   * 手动刷新指南信息（用于章节目录刷新）
   */
  const refreshGuideInfo = useCallback(async () => {
    if (!guideInfo?.id) {
      console.warn('[NASGE Editor] 无法刷新：没有指南 ID');
      return;
    }

    setIsRefreshing(true);
    try {
      console.log('[NASGE Editor] 开始刷新指南信息');
      const info = await fetchGuideInfo(guideInfo.id);
      setGuideInfo(info);
      console.log('[NASGE Editor] 指南信息刷新成功', info);
    } catch (error) {
      console.error('[NASGE Editor] 指南信息刷新失败', error);
      throw error;
    } finally {
      setIsRefreshing(false);
    }
  }, [guideInfo?.id, setGuideInfo]);

  return { mode, refreshGuideInfo, isRefreshing };
}
