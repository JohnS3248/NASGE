/**
 * 此脚本运行在 MAIN world，可以直接访问页面的 window.gPreviewImages
 * 通过 DOM 属性将数据传递给隔离的 content script
 */

declare global {
  interface Window {
    gPreviewImages?: Array<{
      previewid: string;
      filename: string;
      url: string;
      size: number;
      sortorder: number;
      preview_type: number;
    }>;
  }
}

// 必须有export让文件成为模块
export {};

(function() {
  console.log('[NASGE 页面桥接 MAIN] 开始执行');

  function exposeGPreviewImages() {
    try {
      if (typeof window.gPreviewImages !== 'undefined' && window.gPreviewImages) {
        const data = window.gPreviewImages;
        document.documentElement.setAttribute(
          'data-nasge-gpreview-bridge',
          JSON.stringify(data)
        );
        console.log('[NASGE 页面桥接 MAIN] ✅ gPreviewImages 已写入 DOM，共', data.length, '张图片');
        return data.length;
      } else {
        console.warn('[NASGE 页面桥接 MAIN] ⚠️ gPreviewImages 不存在或为空');
        return 0;
      }
    } catch (error) {
      console.error('[NASGE 页面桥接 MAIN] ❌ 错误:', error);
      return -1;
    }
  }

  // 监听来自 content script 的刷新请求
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.channel !== 'nasge:gpreview' || event.data?.action !== 'refresh') return;

    console.log('[NASGE 页面桥接 MAIN] 收到刷新请求');
    const count = exposeGPreviewImages();

    // 回复确认
    window.postMessage({
      channel: 'nasge:gpreview',
      action: 'refreshed',
      count: count
    }, window.location.origin);
  });

  // 多次尝试以确保捕获到数据
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', exposeGPreviewImages);
  } else {
    exposeGPreviewImages();
  }

  // 简化延迟：只在关键时间点尝试
  setTimeout(exposeGPreviewImages, 100);
  setTimeout(exposeGPreviewImages, 500);
  setTimeout(exposeGPreviewImages, 1000);

  console.log('[NASGE 页面桥接 MAIN] 已设置延迟尝试和消息监听');
})();
