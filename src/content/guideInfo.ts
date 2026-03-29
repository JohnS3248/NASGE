/**
 * 从 Steam 指南管理页面提取指南信息
 */

import { loggers } from "../shared/logger";

export type GuideInfoResult = {
  id: string;
  title: string;
  coverUrl?: string;
  chapters: Array<{
    sectionId: string;
    title: string;
    order: number;
  }>;
};

/**
 * 从指南管理页面提取指南信息
 * @param guideId 指南 ID
 * @returns 指南信息
 */
export async function fetchGuideInfo(guideId: string): Promise<GuideInfoResult> {
  loggers.content.info('开始拉取指南信息', { guideId });

  const url = `https://steamcommunity.com/sharedfiles/manageguide/?id=${guideId}`;

  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error(`拉取指南信息失败：HTTP ${response.status}`);
  }

  const html = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // 提取指南标题
  // 标题在 <title> 标签中，格式为 "Steam 社区 :: 标题名称"
  const titleElement = doc.querySelector('title');
  const rawTitle = titleElement?.textContent?.trim() || '';
  // 移除 "Steam 社区 :: " 前缀
  const title = rawTitle.replace(/^Steam\s+社区\s*::\s*/i, '').trim();

  // 提取封面图
  // 尝试多个可能的选择器
  let coverUrl: string | undefined = undefined;
  const coverSelectors = [
    '#previewImage',
    '#previewImageMain',
    '.workshop_item_header img',
    '.workshopItemPreviewImage img',
    'img[src*="steamuserimage"]'
  ];

  for (const selector of coverSelectors) {
    const coverElement = doc.querySelector<HTMLImageElement>(selector);
    if (coverElement?.src) {
      coverUrl = coverElement.src;
      break;
    }
  }

  // 提取章节列表
  // 章节在 <div class="editGuideTOCSection" id="subSection_XXXXX">
  const chapters: Array<{ sectionId: string; title: string; order: number }> = [];
  const sectionContainers = doc.querySelectorAll('.editGuideTOCSection');

  sectionContainers.forEach((container, index) => {
    const containerId = container.id;
    const sectionId = containerId.replace('subSection_', '');

    // 章节标题在 <a class="editGuideTOCSectionTitle">
    const titleLink = container.querySelector('.editGuideTOCSectionTitle a');
    const chapterTitle = titleLink?.textContent?.trim() || '';

    if (sectionId && chapterTitle) {
      chapters.push({
        sectionId,
        title: chapterTitle,
        order: index
      });
    }
  });

  loggers.content.info('指南信息拉取成功', {
    title,
    hasCover: !!coverUrl,
    chaptersCount: chapters.length
  });

  return {
    id: guideId,
    title,
    coverUrl,
    chapters
  };
}
