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
    titleImageUrl?: string;
  }>;
};

const IMAGE_BBCODE_RE = /\[preview(?:icon|img)=/i;

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
  const chapters: Array<{ sectionId: string; title: string; order: number; titleImageUrl?: string }> = [];
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

  // 如果有章节标题包含图片 BBCode，从 preview 页提取透明图片 URL
  const hasImageTitles = chapters.some(c => IMAGE_BBCODE_RE.test(c.title));
  if (hasImageTitles) {
    await resolveTitleImagesFromPreview(guideId, chapters);
  }

  loggers.content.info('指南信息拉取成功', {
    title,
    hasCover: !!coverUrl,
    chaptersCount: chapters.length,
    titleImagesResolved: chapters.filter(c => c.titleImageUrl).length,
  });

  return {
    id: guideId,
    title,
    coverUrl,
    chapters
  };
}

/**
 * 从 preview 页 TOC 提取章节标题的透明图片 URL
 * Preview 页渲染后的 TOC 格式：
 *   <span onclick="SelectGuideSection('SECTION_ID', ...)"><img src="透明URL" ...></span>
 */
async function resolveTitleImagesFromPreview(
  guideId: string,
  chapters: Array<{ sectionId: string; titleImageUrl?: string }>
): Promise<void> {
  try {
    const previewUrl = `https://steamcommunity.com/sharedfiles/filedetails/?id=${guideId}&preview=true`;
    const resp = await fetch(previewUrl, { method: 'GET', credentials: 'include' });
    if (!resp.ok) {
      loggers.content.warn('preview 页拉取失败', { status: resp.status });
      return;
    }

    const html = await resp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 查找所有含 SelectGuideSection 的 TOC 条目
    const tocEntries = doc.querySelectorAll('[onclick*=SelectGuideSection]');
    const sectionImageMap = new Map<string, string>();

    for (const entry of Array.from(tocEntries)) {
      const onclick = entry.getAttribute('onclick') || '';
      const sectionMatch = onclick.match(/SelectGuideSection\(\s*'(\d+)'/);
      if (!sectionMatch) continue;

      const img = entry.querySelector('img');
      if (!img?.src) continue;

      sectionImageMap.set(sectionMatch[1], img.src);
    }

    // 回填到 chapters
    for (const chapter of chapters) {
      const imageUrl = sectionImageMap.get(chapter.sectionId);
      if (imageUrl) {
        chapter.titleImageUrl = imageUrl;
      }
    }

    loggers.content.info('从 preview 页解析标题图片', {
      tocEntries: tocEntries.length,
      imagesFound: sectionImageMap.size,
    });
  } catch (error) {
    loggers.content.warn('preview 页标题图片解析失败', error);
  }
}
