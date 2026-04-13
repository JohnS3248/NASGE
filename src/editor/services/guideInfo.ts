/**
 * 编辑器端的指南信息服务
 * 通过消息传递与 content script 通信
 */

import type { GuideInfo } from "../stores/useGuideStore";
import { loggers } from "../../shared/logger";
import { classifyError } from "../utils/errorClassifier";

/**
 * 从 Steam 拉取指南信息（封面、标题、章节列表）
 */
export async function fetchGuideInfo(guideId: string): Promise<GuideInfo> {
  loggers.editor.verbose('请求拉取指南信息', { guideId });

  const response = await chrome.runtime.sendMessage({
    channel: 'nasge:steam',
    action: "fetch-guide-info",
    guideId
  });

  if (!response.ok) {
    throw classifyError(response);
  }

  loggers.editor.verbose('指南信息拉取成功', response.data);

  return {
    id: response.data.id,
    title: response.data.title,
    coverUrl: response.data.coverUrl,
    chapters: response.data.chapters
  };
}
