import { useState, useEffect } from 'react';

export type PageType = 'guide' | 'review' | 'other';

export type PageInfo = {
  type: PageType;
  url: string;
  guideId?: string;
  reviewId?: string;
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
        console.log('[NASGE Popup] 检测页面 URL:', url);

        // 检测指南管理页
        // URL 格式: https://steamcommunity.com/sharedfiles/manageguide/?id=XXXXXXXXX
        const guideMatch = url.match(/steamcommunity\.com\/sharedfiles\/manageguide\/\?id=(\d+)/);
        if (guideMatch) {
          const guideId = guideMatch[1];
          console.log('[NASGE Popup] 检测到指南管理页，guideId:', guideId);
          setPageInfo({ type: 'guide', url, guideId });
          return;
        }

        // 检测评测页
        // URL 格式: https://steamcommunity.com/id/USERNAME/reviews/ 或 /profiles/USERID/reviews/
        const reviewMatch = url.match(/steamcommunity\.com\/(id\/[^/]+|profiles\/\d+)\/reviews/);
        if (reviewMatch) {
          // 评测 ID 需要从页面内容提取，这里先不实现
          console.log('[NASGE Popup] 检测到评测页');
          setPageInfo({ type: 'review', url });
          return;
        }

        // 其他页面
        setPageInfo({ type: 'other', url });
      } catch (error) {
        console.error('[NASGE Popup] 检测页面类型失败:', error);
        setPageInfo({ type: 'other', url: '' });
      }
    }

    detectPage();
  }, []);

  return pageInfo;
}
