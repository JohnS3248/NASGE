/**
 * 编辑器端的章节同步服务
 * 通过消息传递与 content script 通信
 */

import type { ChapterContent } from "../../content/chapterSync";
import { loggers } from "../../shared/logger";
import { classifyError } from "../utils/errorClassifier";

/**
 * 从 Steam 拉取章节内容
 */
export async function fetchChapterFromSteam(
  guideId: string,
  sectionId: string
): Promise<ChapterContent> {
  loggers.sync.info('请求拉取章节内容', { guideId, sectionId });

  const response = await chrome.runtime.sendMessage({
    channel: 'nasge:steam',
    action: "fetch-chapter",
    guideId,
    sectionId
  });

  if (!response.ok) {
    throw classifyError(response);
  }

  loggers.sync.info('章节内容拉取成功', response.data);

  return response.data;
}

/**
 * 获取 Steam sessionId（通过注入脚本到指南页面）
 *
 * 公开导出供 useWholeGuideSync 在 push 阶段缓存复用，避免逐章重复获取。
 */
export async function getSessionId(): Promise<string> {
  // 查询指南管理页面的标签页
  const tabs = await chrome.tabs.query({
    url: "https://steamcommunity.com/sharedfiles/manageguide/*"
  });

  if (tabs.length === 0) {
    throw new Error("未找到指南管理页面，请确保页面已打开");
  }

  const tab = tabs[0];
  if (!tab.id) {
    throw new Error("无法获取标签页 ID");
  }

  // 通过 executeScript 注入代码获取 sessionId
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- runs in Steam page context where g_sessionID exists
    func: () => {
      return (window as any).g_sessionID;
    }
  });

  const sessionId = results[0]?.result;
  if (!sessionId) {
    throw new Error("无法获取 sessionid，请确保已登录 Steam");
  }

  loggers.sync.verbose('成功获取 sessionId');
  return sessionId;
}

/**
 * 保存章节内容到 Steam
 *
 * @param cachedSessionId 可选：调用方已缓存的 sessionId，避免逐章重复 getSessionId
 */
export async function saveChapterToSteam(
  guideId: string,
  sectionId: string | undefined,
  title: string,
  description: string,
  cachedSessionId?: string
): Promise<string> {
  loggers.sync.info('请求保存章节内容', { guideId, sectionId, title });

  // 复用调用方传入的 sessionId，否则就地获取
  const sessionId = cachedSessionId ?? await getSessionId();

  const response = await chrome.runtime.sendMessage({
    channel: 'nasge:steam',
    action: "save-chapter",
    guideId,
    sectionId,
    title,
    description,
    sessionId
  });

  if (!response.ok) {
    throw classifyError(response);
  }

  loggers.sync.info('章节内容保存成功', response.data);

  return response.data.sectionId;
}

/**
 * 从 Steam 拉取指南的所有章节列表
 */
export async function fetchChapterList(guideId: string): Promise<Array<{
  sectionId: string;
  title: string;
  order: number;
}>> {
  loggers.sync.info('请求拉取章节列表', { guideId });

  const response = await chrome.runtime.sendMessage({
    channel: 'nasge:steam',
    action: "fetch-chapter-list",
    guideId
  });

  if (!response.ok) {
    throw classifyError(response);
  }

  loggers.sync.info('章节列表拉取成功', response.data);

  return response.data.chapters;
}

/**
 * 在 Steam 创建新章节
 * @param guideId 指南 ID
 * @returns 新章节的 sectionId
 */
export async function createChapterOnSteam(guideId: string): Promise<string> {
  loggers.sync.info('请求创建新章节', { guideId });

  // 获取 sessionId
  const sessionId = await getSessionId();

  // 查询指南管理页面的标签页
  const tabs = await chrome.tabs.query({
    url: "https://steamcommunity.com/sharedfiles/manageguide/*"
  });

  if (tabs.length === 0) {
    throw new Error("未找到指南管理页面");
  }

  const tab = tabs[0];
  if (!tab.id) {
    throw new Error("无法获取标签页 ID");
  }

  // 构造请求参数（创建空章节只需要 id 和 sessionid）
  const params = new URLSearchParams();
  params.set('id', guideId);
  params.set('sessionid', sessionId);

  // 通过注入脚本发送请求
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: (url: string, data: string) => {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        xhr.setRequestHeader('X-Prototype-Version', '1.7');

        xhr.onload = function() {
          if (xhr.status === 200) {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve(response);
            } catch (e) {
              reject(new Error('解析响应失败'));
            }
          } else {
            reject(new Error(`请求失败: ${xhr.status}`));
          }
        };

        xhr.onerror = function() {
          reject(new Error('网络错误'));
        };

        xhr.send(data);
      });
    },
    args: ['https://steamcommunity.com/sharedfiles/setguidesubsection', params.toString()]
  });

  // Steam setguidesubsection API response shape
  const response = results[0]?.result as { success?: number; sectionid?: string; timeSaved?: string } | undefined;

  if (!response || response.success !== 1) {
    throw classifyError({
      ok: false,
      error: "创建章节失败",
      eresult: response?.success,
    });
  }

  loggers.sync.info('新章节创建成功', {
    sectionId: response.sectionid,
    timeSaved: response.timeSaved
  });

  return response.sectionid ?? "";
}

/**
 * 保存章节排序到 Steam
 * @param guideId 指南ID
 * @param orderedSectionIds 按新顺序排列的章节ID数组
 */
export async function reorderChaptersOnSteam(
  guideId: string,
  orderedSectionIds: string[]
): Promise<void> {
  loggers.sync.info('请求更新章节排序', { guideId, orderedSectionIds });

  // 获取 sessionId
  const sessionId = await getSessionId();

  // 构造 form data
  const formData = new URLSearchParams();
  formData.append('id', guideId);
  formData.append('sessionid', sessionId);

  // 为每个章节添加排序参数
  orderedSectionIds.forEach((sectionId, index) => {
    formData.append(`sub_sections[${sectionId}][sort_order]`, index.toString());
  });

  loggers.sync.verbose('发送排序请求', formData.toString());

  // 发送请求到 Steam
  const tabs = await chrome.tabs.query({
    url: "https://steamcommunity.com/sharedfiles/manageguide/*"
  });

  if (tabs.length === 0) {
    throw new Error("未找到指南管理页面");
  }

  const tab = tabs[0];
  if (!tab.id) {
    throw new Error("无法获取标签页 ID");
  }

  // 通过注入脚本发送 XHR 请求
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: (url: string, data: string) => {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        xhr.setRequestHeader('X-Prototype-Version', '1.7');

        xhr.onload = function() {
          if (xhr.status === 200) {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve(response);
            } catch (e) {
              reject(new Error('解析响应失败'));
            }
          } else {
            reject(new Error(`请求失败: ${xhr.status}`));
          }
        };

        xhr.onerror = function() {
          reject(new Error('网络错误'));
        };

        xhr.send(data);
      });
    },
    args: ['https://steamcommunity.com/sharedfiles/setguidesubsectionorder', formData.toString()]
  });

  // Steam setguidesubsectionorder API response shape
  const response = results[0]?.result as { success?: number } | undefined;

  if (!response || response.success !== 1) {
    throw classifyError({
      ok: false,
      error: "章节排序保存失败",
      eresult: response?.success,
    });
  }

  loggers.sync.info('章节排序保存成功');
}

/**
 * 使用 Steam 的官方 API 预览 BBCode 内容
 * @param guideId 指南 ID
 * @param sectionId 章节 ID
 * @param title 章节标题
 * @param description BBCode 格式内容
 * @returns 渲染后的 HTML
 */
export async function previewChapterFromSteam(
  guideId: string,
  sectionId: string,
  title: string,
  description: string
): Promise<string> {
  loggers.sync.verbose('请求 Steam 预览', { guideId, sectionId, title });

  // 获取 sessionId
  const sessionId = await getSessionId();

  // 查询指南管理页面的标签页
  const tabs = await chrome.tabs.query({
    url: "https://steamcommunity.com/sharedfiles/manageguide/*"
  });

  if (tabs.length === 0) {
    throw new Error("未找到指南管理页面，无法使用预览功能");
  }

  const tab = tabs[0];
  if (!tab.id) {
    throw new Error("无法获取标签页 ID");
  }

  // 构造请求参数
  const params = new URLSearchParams();
  params.set('id', guideId);
  params.set('sectionid', sectionId);
  params.set('sessionid', sessionId);
  params.set('title', title);
  params.set('description', description);

  // 通过注入脚本发送预览请求
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: (url: string, data: string) => {
      return new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        xhr.setRequestHeader('X-Prototype-Version', '1.7');

        xhr.onload = function() {
          if (xhr.status === 200) {
            // Steam 预览 API 返回 JSON: {"success":1,"title":"...","description":"<html>"}
            try {
              const json = JSON.parse(xhr.responseText);
              if (json.success === 1 && json.description) {
                resolve(json.description);
              } else {
                reject(new Error('预览响应格式错误'));
              }
            } catch (e) {
              // 如果解析失败，可能是直接返回 HTML
              resolve(xhr.responseText);
            }
          } else {
            reject(new Error(`预览请求失败: ${xhr.status}`));
          }
        };

        xhr.onerror = function() {
          reject(new Error('网络错误'));
        };

        xhr.send(data);
      });
    },
    args: ['https://steamcommunity.com/sharedfiles/previewguidesubsection', params.toString()]
  });

  const html = results[0]?.result as string;

  if (!html) {
    throw new Error('预览返回为空');
  }

  loggers.sync.verbose('Steam 预览成功', { htmlLength: html.length });

  return html;
}
