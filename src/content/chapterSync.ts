/**
 * 章节同步功能：从 Steam 拉取章节内容，保存章节内容到 Steam
 */

export type ChapterContent = {
  title: string;
  description: string; // BBCode 格式的章节内容
};

/**
 * 从 Steam 拉取章节内容
 * @param guideId 指南 ID
 * @param sectionId 章节 ID
 * @returns 章节标题和内容（BBCode）
 */
export async function fetchChapterFromSteam(
  guideId: string,
  sectionId: string
): Promise<ChapterContent> {
  console.info("[NASGE] 开始拉取章节内容", { guideId, sectionId });

  const url = `https://steamcommunity.com/sharedfiles/editguidesubsection/?id=${guideId}&sectionid=${sectionId}`;

  const response = await fetch(url, {
    method: "GET",
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error(`拉取章节失败：HTTP ${response.status}`);
  }

  const html = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // 读取章节标题
  const titleInput = doc.querySelector<HTMLInputElement>('input[name="title"]');
  const title = titleInput?.value || "";

  // 读取章节内容（BBCode）
  const descTextarea = doc.querySelector<HTMLTextAreaElement>('textarea[name="description"]');
  const description = descTextarea?.value || "";

  console.info("[NASGE] 章节内容拉取成功", {
    title,
    descriptionLength: description.length
  });

  return { title, description };
}

/**
 * 保存章节内容到 Steam
 * @param guideId 指南 ID
 * @param sectionId 章节 ID（如果为空，则创建新章节）
 * @param title 章节标题
 * @param description 章节内容（BBCode）
 * @param sessionId Steam sessionid（从 MAIN world 传递）
 * @returns 保存后的章节 ID
 */
export async function saveChapterToSteam(
  guideId: string,
  sectionId: string | undefined,
  title: string,
  description: string,
  sessionId?: string
): Promise<string> {
  console.info("[NASGE] 开始保存章节内容", { guideId, sectionId, title });

  // 使用传递的 sessionid，如果没有则尝试从 window 获取（兼容旧调用方式）
  const finalSessionId = sessionId || (window as any).g_sessionID;
  if (!finalSessionId) {
    throw new Error("无法获取 sessionid，请确保已登录 Steam");
  }

  const params = new URLSearchParams();
  params.set("id", guideId);
  params.set("sessionid", finalSessionId);
  params.set("title", title);
  params.set("description", description);

  if (sectionId) {
    // 更新现有章节
    params.set("sectionid", sectionId);
  }

  const response = await fetch("https://steamcommunity.com/sharedfiles/setguidesubsection", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "X-Prototype-Version": "1.7"
    },
    body: params.toString(),
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error(`保存章节失败：HTTP ${response.status}`);
  }

  const result = await response.json();

  if (result.success !== 1) {
    throw new Error(`Steam 保存章节失败，返回代码：${result.success}`);
  }

  const savedSectionId = sectionId || result.sectionid;

  console.info("[NASGE] 章节保存成功", {
    sectionId: savedSectionId,
    timeSaved: result.timeSaved
  });

  return savedSectionId;
}

/**
 * 从 Steam 拉取指南的所有章节列表
 * @param guideId 指南 ID
 * @returns 章节列表
 */
export async function fetchChapterList(guideId: string): Promise<Array<{
  sectionId: string;
  title: string;
  order: number;
}>> {
  console.info("[NASGE] 开始拉取章节列表", { guideId });

  const url = `https://steamcommunity.com/sharedfiles/manageguide/?id=${guideId}`;

  const response = await fetch(url, {
    method: "GET",
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error(`拉取章节列表失败：HTTP ${response.status}`);
  }

  const html = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const chapters: Array<{ sectionId: string; title: string; order: number }> = [];

  // 查找所有章节容器
  const sectionContainers = doc.querySelectorAll(".editGuideTOCSection");

  sectionContainers.forEach((container, index) => {
    // 从容器 ID 提取 sectionId
    const containerId = container.id; // 例如 "subSection_8379603"
    const sectionId = containerId.replace("subSection_", "");

    // 提取章节标题
    const titleLink = container.querySelector(".editGuideTOCSectionTitle a");
    const title = titleLink?.textContent?.trim() || "";

    if (sectionId && title) {
      chapters.push({
        sectionId,
        title,
        order: index
      });
    }
  });

  console.info("[NASGE] 章节列表拉取成功", { count: chapters.length });

  return chapters;
}
