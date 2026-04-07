/**
 * Vitest 全局测试基础设施
 *
 * 职责：
 * - 每个 test 前清理 localStorage / sessionStorage，避免 Zustand persist
 *   中间件导致的跨测试状态泄漏
 * - 预留 chrome.* API stub 入口（目前 store 层未依赖，Phase 4 服务测试时再补）
 *
 * 不做：
 * - 不 mock fetch / XHR（当前测试链路不触达网络）
 * - 不全局 mock Zustand，单个测试用例可按需 vi.mock
 */
import { beforeEach } from "vitest";

beforeEach(() => {
  // jsdom 原生提供 localStorage / sessionStorage，但不会自动在测试间清理
  // Zustand persist 中间件会在 create 阶段 rehydrate，导致前一个 test
  // 写入的数据污染后续 test。必须显式 clear。
  localStorage.clear();
  sessionStorage.clear();
});
