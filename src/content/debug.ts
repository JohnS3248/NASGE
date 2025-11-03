/**
 * 调试脚本 - 运行在页面主世界（MAIN world）
 * 用于在控制台测试章节同步 API
 */

// 导出一个空对象以使此文件成为模块
export {};

declare global {
  interface Window {
    __NASGE_DEBUG__?: {
      fetchChapterList: (guideId: string) => Promise<Array<{ sectionId: string; title: string; order: number }>>;
      fetchChapter: (guideId: string, sectionId: string) => Promise<{ title: string; description: string }>;
      saveChapter: (guideId: string, sectionId: string | undefined, title: string, description: string) => Promise<string>;
    };
  }
}

(() => {
  (window as any).__NASGE_DEBUG__ = {
    async fetchChapterList(guideId: string) {
      return new Promise((resolve, reject) => {
        const requestId = "debug-" + Date.now() + "-" + Math.random();

        const handler = (event: MessageEvent) => {
          if (
            event.data?.channel === "nasge:steam" &&
            event.data?.direction === "content->page" &&
            event.data?.requestId === requestId
          ) {
            window.removeEventListener("message", handler);
            if (event.data.response.ok) {
              resolve(event.data.response.data.chapters);
            } else {
              reject(new Error(event.data.response.error));
            }
          }
        };

        window.addEventListener("message", handler);

        window.postMessage(
          {
            channel: "nasge:steam",
            direction: "page->content",
            requestId: requestId,
            action: "fetch-chapter-list",
            guideId: guideId
          },
          "*"
        );
      });
    },

    async fetchChapter(guideId: string, sectionId: string) {
      return new Promise((resolve, reject) => {
        const requestId = "debug-" + Date.now() + "-" + Math.random();

        const handler = (event: MessageEvent) => {
          if (
            event.data?.channel === "nasge:steam" &&
            event.data?.direction === "content->page" &&
            event.data?.requestId === requestId
          ) {
            window.removeEventListener("message", handler);
            if (event.data.response.ok) {
              resolve(event.data.response.data);
            } else {
              reject(new Error(event.data.response.error));
            }
          }
        };

        window.addEventListener("message", handler);

        window.postMessage(
          {
            channel: "nasge:steam",
            direction: "page->content",
            requestId: requestId,
            action: "fetch-chapter",
            guideId: guideId,
            sectionId: sectionId
          },
          "*"
        );
      });
    },

    async saveChapter(guideId: string, sectionId: string | undefined, title: string, description: string) {
      return new Promise((resolve, reject) => {
        const requestId = "debug-" + Date.now() + "-" + Math.random();

        const handler = (event: MessageEvent) => {
          if (
            event.data?.channel === "nasge:steam" &&
            event.data?.direction === "content->page" &&
            event.data?.requestId === requestId
          ) {
            window.removeEventListener("message", handler);
            if (event.data.response.ok) {
              resolve(event.data.response.data.sectionId);
            } else {
              reject(new Error(event.data.response.error));
            }
          }
        };

        window.addEventListener("message", handler);

        // 从页面主世界获取 sessionid
        const sessionId = (window as any).g_sessionID;
        if (!sessionId) {
          reject(new Error("无法获取 sessionid，请确保已登录 Steam"));
          return;
        }

        window.postMessage(
          {
            channel: "nasge:steam",
            direction: "page->content",
            requestId: requestId,
            action: "save-chapter",
            guideId: guideId,
            sectionId: sectionId,
            title: title,
            description: description,
            sessionId: sessionId  // 传递 sessionid
          },
          "*"
        );
      });
    }
  };

  console.info("[NASGE] 调试函数已暴露到 window.__NASGE_DEBUG__");
  console.info("[NASGE] 可用方法：");
  console.info("  - await window.__NASGE_DEBUG__.fetchChapterList(guideId)");
  console.info("  - await window.__NASGE_DEBUG__.fetchChapter(guideId, sectionId)");
  console.info("  - await window.__NASGE_DEBUG__.saveChapter(guideId, sectionId, title, description)");
})();
