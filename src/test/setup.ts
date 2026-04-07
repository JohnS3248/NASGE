/**
 * Vitest 全局测试基础设施
 *
 * 职责：
 * - 每个 test 前清理 localStorage / sessionStorage，避免 Zustand persist
 *   中间件导致的跨测试状态泄漏
 * - 为 `globalThis.chrome` 打最小桩：某些 store 经 titleHelpers →
 *   useSteamGuideImageStore → steamBridge 链路加载时会访问 `chrome?.runtime`，
 *   `chrome` 是裸标识符，在非扩展环境会抛 ReferenceError
 *
 * 不做：
 * - 不 mock fetch / XHR（当前测试链路不触达网络）
 * - 不全局 mock Zustand，单个测试用例可按需 vi.mock
 */
import { beforeEach } from "vitest";

// 最小 chrome 桩：保证 steamBridge 等模块能被 import 时求值不报 ReferenceError。
// 需要真实行为的测试应自行 vi.mock 对应模块。
if (typeof (globalThis as Record<string, unknown>).chrome === "undefined") {
  (globalThis as Record<string, unknown>).chrome = {
    runtime: {
      sendMessage: () => Promise.resolve(undefined),
      onMessage: {
        addListener: () => {},
        removeListener: () => {}
      },
      lastError: undefined
    }
  };
}

beforeEach(() => {
  // jsdom 原生提供 localStorage / sessionStorage，但不会自动在测试间清理
  // Zustand persist 中间件会在 create 阶段 rehydrate，导致前一个 test
  // 写入的数据污染后续 test。必须显式 clear。
  localStorage.clear();
  sessionStorage.clear();
});
