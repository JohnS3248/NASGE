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
  console.log('[NASGE Editor] 请求拉取章节内容', { guideId, sectionId });

  const response = await chrome.runtime.sendMessage({
    channel: 'nasge:steam',
    action: "fetch-chapter",
    guideId,
    sectionId
  });

  if (!response.ok) {
    throw new Error(response.error || "拉取章节失败");
  }

  console.log('[NASGE Editor] 章节内容拉取成功', response.data);

  return response.data;
}

/**
 * 获取 Steam sessionId（通过注入脚本到指南页面）
 */
async function getSessionId(): Promise<string> {
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
    func: () => {
      return (window as any).g_sessionID;
    }
  });

  const sessionId = results[0]?.result;
  if (!sessionId) {
    throw new Error("无法获取 sessionid，请确保已登录 Steam");
  }

  console.log('[NASGE Editor] 成功获取 sessionId');
  return sessionId;
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
  console.log('[NASGE Editor] 请求保存章节内容', { guideId, sectionId, title });

  // 先获取 sessionId
  const sessionId = await getSessionId();

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
    throw new Error(response.error || "保存章节失败");
  }

  console.log('[NASGE Editor] 章节内容保存成功', response.data);

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
  console.log('[NASGE Editor] 请求拉取章节列表', { guideId });

  const response = await chrome.runtime.sendMessage({
    channel: 'nasge:steam',
    action: "fetch-chapter-list",
    guideId
  });

  if (!response.ok) {
    throw new Error(response.error || "拉取章节列表失败");
  }

  console.log('[NASGE Editor] 章节列表拉取成功', response.data);

  return response.data.chapters;
}

/**
 * 在 Steam 创建新章节
 * @param guideId 指南 ID
 * @returns 新章节的 sectionId
 */
export async function createChapterOnSteam(guideId: string): Promise<string> {
  console.log('[NASGE Editor] 请求创建新章节', { guideId });

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

  const response = results[0]?.result as any;

  if (!response || response.success !== 1) {
    throw new Error('创建章节失败');
  }

  console.log('[NASGE Editor] 新章节创建成功', {
    sectionId: response.sectionid,
    timeSaved: response.timeSaved
  });

  return response.sectionid;
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
  console.log('[NASGE Editor] 请求更新章节排序', { guideId, orderedSectionIds });

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

  console.log('[NASGE Editor] 发送排序请求', formData.toString());

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

  const response = results[0]?.result as any;

  if (!response || response.success !== 1) {
    throw new Error('章节排序保存失败');
  }

  console.log('[NASGE Editor] 章节排序保存成功');
}
