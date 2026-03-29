import { useEffect, useCallback, useState, useRef } from 'react';
import { useGuideStore, type EditorMode } from '../stores/useGuideStore';
import { fetchGuideInfo } from '../services/guideInfo';
import { loggers } from '../../shared/logger';
import { bbcodeToHtml } from '../utils/bbcode';
import { generateJSON } from '@tiptap/html';
import { createEditorExtensions } from '../utils/editorExtensions';

const VALID_MODES = new Set<string>(['guide', 'review', 'offline-guide', 'offline-review', 'offline']);

function resolveMode(raw: string): EditorMode {
  // 兼容旧 URL 参数 ?mode=offline → offline-guide
  if (raw === 'offline') return 'offline-guide';
  return raw as EditorMode;
}

/**
 * 根据 URL 参数初始化编辑器模式和指南信息
 */
export function useEditorMode() {
  const { mode, setMode, setGuideInfo, guideInfo } = useGuideStore();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasInitialized = useRef(false);

  useEffect(() => {
    // 防止重复初始化
    if (hasInitialized.current) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const urlModeRaw = params.get('mode');
    const guideId = params.get('guideId');
    const appId = params.get('appId');

    loggers.editor.verbose('URL 参数', { urlModeRaw, guideId, appId });

    // 设置模式（仅当模式不同时）
    if (urlModeRaw && VALID_MODES.has(urlModeRaw)) {
      const resolved = resolveMode(urlModeRaw);
      if (mode !== resolved) {
        setMode(resolved);
        loggers.editor.verbose('设置模式:', resolved);
      }
    }

    const resolved = urlModeRaw && VALID_MODES.has(urlModeRaw)
      ? resolveMode(urlModeRaw)
      : mode;

    // 离线模式：始终调用 setMode 触发状态清理（即使 mode 值没变）
    if (resolved === 'offline-guide' || resolved === 'offline-review') {
      setMode(resolved);
      hasInitialized.current = true;
      return;
    }

    // 如果是评测模式且有 appId，初始化评测信息
    if (resolved === 'review' && appId) {
      import('../services/reviewBridge').then(({ fetchReviewForm }) => {
        fetchReviewForm().then((data) => {
          // 1. 保存评测设置
          import('../stores/useReviewStore').then(({ useReviewStore }) => {
            useReviewStore.getState().setReviewInfo(data);
          });

          // 2. 将评测文本导入草稿
          if (data.text) {
            const html = bbcodeToHtml(data.text);
            const extensions = createEditorExtensions({ reviewMode: true });
            const contentJson = generateJSON(html, extensions);

            const store = useGuideStore.getState();
            const existingDraft = store.drafts.find(d =>
              d.draftType === 'review' && !d.linkedGuideId
            );

            if (existingDraft) {
              store.updateDraft(existingDraft.id, { content: contentJson });
              useGuideStore.setState({ activeDraftId: existingDraft.id });
            } else {
              const newDraft = store.addDraft(data.gameName || '评测');
              store.updateDraft(newDraft.id, { content: contentJson });
            }
          }

          loggers.editor.info('评测信息导入成功', data);
        }).catch((error) => {
          loggers.editor.error('评测信息导入失败', error);
        });
      });
      hasInitialized.current = true;
      return;
    }

    // 如果是指南模式且有 guideId，检查是否需要拉取指南信息
    if (resolved === 'guide' && guideId) {
      // 如果已经有相同 ID 的指南信息，跳过拉取
      if (guideInfo?.id === guideId) {
        loggers.editor.verbose('指南信息已存在，跳过拉取', { guideId });
        hasInitialized.current = true;
        return;
      }

      loggers.editor.info('开始导入指南信息', { guideId });

      // 添加重试逻辑，处理 content script 未就绪的情况
      const fetchWithRetry = async (retries = 3, initialDelay = 300) => {
        // 初始延迟：给 Steam content script 时间准备
        await new Promise(resolve => setTimeout(resolve, initialDelay));

        let delay = 500;

        for (let i = 0; i < retries; i++) {
          try {
            const info = await fetchGuideInfo(guideId);
            loggers.editor.info('指南信息导入成功', info);
            setGuideInfo(info);
            return;
          } catch (error) {
            const isConnectionError = error instanceof Error &&
              (error.message.includes('Could not establish connection') ||
               error.message.includes('Receiving end does not exist'));

            if (isConnectionError && i < retries - 1) {
              loggers.editor.info(`连接 Steam 中，${delay}ms 后重试 (${i + 1}/${retries})`);
              await new Promise(resolve => setTimeout(resolve, delay));
              delay *= 2;
            } else {
              const errorMessage = error instanceof Error ? error.message : String(error);
              loggers.editor.error('指南信息导入失败:', errorMessage);

              if (isConnectionError) {
                loggers.editor.error('无法连接到 Steam 页面，请确保已打开指南编辑页面');
              }
              return;
            }
          }
        }
      };

      fetchWithRetry().catch((error) => {
        loggers.editor.error('fetchWithRetry 最终失败', error);
      });

      hasInitialized.current = true;
    }
  }, [mode, setMode, setGuideInfo, guideInfo]);

  /**
   * 手动刷新指南信息（用于章节目录刷新）
   */
  const refreshGuideInfo = useCallback(async () => {
    if (!guideInfo?.id) {
      loggers.editor.warn('无法刷新：没有指南 ID');
      return;
    }

    setIsRefreshing(true);
    try {
      loggers.editor.info('开始刷新指南信息');
      const info = await fetchGuideInfo(guideInfo.id);
      setGuideInfo(info);
      loggers.editor.info('指南信息刷新成功', info);
    } catch (error) {
      loggers.editor.error('指南信息刷新失败', error);
      throw error;
    } finally {
      setIsRefreshing(false);
    }
  }, [guideInfo?.id, setGuideInfo]);

  return { mode, refreshGuideInfo, isRefreshing };
}
