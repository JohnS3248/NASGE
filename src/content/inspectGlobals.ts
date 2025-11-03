/**
 * 临时调试脚本 - 检查 Steam 页面的全局变量
 * 运行在 MAIN world，用于查找 sessionid 的实际变量名
 */

export {};

declare global {
  interface Window {
    __NASGE_INSPECT__?: () => void;
  }
}

(() => {
  (window as any).__NASGE_INSPECT__ = () => {
    console.log("=== Steam 全局变量检查 ===");

    // 检查常见的 sessionid 变量名
    const possibleNames = [
      'g_sessionID',
      'g_sessionId',
      'sessionID',
      'sessionId',
      'g_strSessionID',
      'Steam',
      'g_rgGlobals'
    ];

    for (const name of possibleNames) {
      const value = (window as any)[name];
      if (value !== undefined) {
        console.log(`✓ window.${name}:`, typeof value === 'object' ? JSON.stringify(value, null, 2) : value);
      } else {
        console.log(`✗ window.${name}: undefined`);
      }
    }

    // 尝试查找所有包含 'session' 的全局变量
    console.log("\n=== 包含 'session' 的全局变量 ===");
    for (const key in window) {
      if (key.toLowerCase().includes('session')) {
        console.log(`window.${key}:`, (window as any)[key]);
      }
    }
  };

  console.info("[NASGE] 调试函数 window.__NASGE_INSPECT__() 已就绪");
})();
