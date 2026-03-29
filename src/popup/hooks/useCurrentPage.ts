import { useState, useEffect } from 'react';
import { loggers } from '../../shared/logger';

export type PageType = 'guide' | 'review' | 'other';

export type PageInfo = {
  type: PageType;
  url: string;
  guideId?: string;
  reviewId?: string;
  appId?: string;
};

/**
 * 检测当前活动标签页的类型
 */
export function useCurrentPage(): PageInfo | null {
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);

  useEffect(() => {
    async function detectPage() {
      try {
        // 获取当前活动标签页
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab?.url) {
          setPageInfo({ type: 'other', url: '' });
          return;
        }

        const url = tab.url;
        loggers.popup.verbose('检测页面 URL:', url);

        // 检测指南管理页
        // URL 格式: https://steamcommunity.com/sharedfiles/manageguide/?id=XXXXXXXXX
        const guideMatch = url.match(/steamcommunity\.com\/sharedfiles\/manageguide\/\?id=(\d+)/);
        if (guideMatch) {
          const guideId = guideMatch[1];
          loggers.popup.verbose('检测到指南管理页，guideId:', guideId);
          setPageInfo({ type: 'guide', url, guideId });
          return;
        }

        // 检测 Steam 商店游戏页（评测编辑入口）
        // URL 格式: https://store.steampowered.com/app/XXXXXX/GameName/
        const storeMatch = url.match(/store\.steampowered\.com\/app\/(\d+)/);
        if (storeMatch) {
          const appId = storeMatch[1];
          loggers.popup.verbose('检测到商店游戏页，appId:', appId);
          setPageInfo({ type: 'review', url, appId });
          return;
        }

        // 检测评测列表页
        // URL 格式: https://steamcommunity.com/id/USERNAME/reviews/ 或 /profiles/USERID/reviews/
        const reviewMatch = url.match(/steamcommunity\.com\/(id\/[^/]+|profiles\/\d+)\/reviews/);
        if (reviewMatch) {
          loggers.popup.verbose('检测到评测列表页');
          setPageInfo({ type: 'review', url });
          return;
        }

        // 其他页面
        setPageInfo({ type: 'other', url });
      } catch (error) {
        loggers.popup.error('检测页面类型失败:', error);
        setPageInfo({ type: 'other', url: '' });
      }
    }

    detectPage();
  }, []);

  return pageInfo;
}
