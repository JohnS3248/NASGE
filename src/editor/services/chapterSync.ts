/**
 * 编辑器端的章节同步服务
 * 通过消息传递与 content script 通信
 */

import type { ChapterContent } from "../../content/chapterSync";

/**
 * 从 Steam 拉取章节内容
 */
export async function fetchChapterFromSteam(
  guideId: string,
  sectionId: string
): Promise<ChapterContent> {
  const response = await chrome.runtime.sendMessage({
    action: "fetch-chapter",
    guideId,
    sectionId
  });

  if (!response.ok) {
    throw new Error(response.error || "拉取章节失败");
  }

  return response.data;
}

/**
 * 保存章节内容到 Steam
 */
export async function saveChapterToSteam(
  guideId: string,
  sectionId: string | undefined,
  title: string,
  description: string
): Promise<string> {
  const response = await chrome.runtime.sendMessage({
    action: "save-chapter",
    guideId,
    sectionId,
    title,
    description
  });

  if (!response.ok) {
    throw new Error(response.error || "保存章节失败");
  }

  return response.sectionId;
}

/**
 * 从 Steam 拉取指南的所有章节列表
 */
export async function fetchChapterList(guideId: string): Promise<Array<{
  sectionId: string;
  title: string;
  order: number;
}>> {
  const response = await chrome.runtime.sendMessage({
    action: "fetch-chapter-list",
    guideId
  });

  if (!response.ok) {
    throw new Error(response.error || "拉取章节列表失败");
  }

  return response.chapters;
}
