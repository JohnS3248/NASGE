/**
 * ImageUploadService 测试
 *
 * 覆盖范围：
 * - queuePoolUpload 的同步守卫（文件大小 / 已上传 / 已在池 / 已在队列）
 * - queuePoolBatchUpload 循环入队
 * - 队列顺序处理 + 成功路径
 * - Error 29（DuplicateRequest）→ 立即 skip 不重试
 * - 一般错误 → 重试到 maxRetries
 * - subscribePoolQueue / getPoolQueueState 快照
 *
 * 不测：
 * - uploadByImageId / uploadByNodeId / uploadMultiple / uploadAllPending
 *   （依赖 useImageStore，走 TipTap 编辑器路径，与图片池队列是两条独立链路）
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// Mock（在 import 被测模块前 hoist）
// ============================================================================

vi.mock("../../../i18n", () => ({
  i18n: { changeLanguage: vi.fn() },
  resolveLocale: (l: string) => (l === "auto" ? "zh-CN" : l)
}));

vi.mock("i18next", () => ({
  default: {
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts) return `${key}|${JSON.stringify(opts)}`;
      return key;
    },
    changeLanguage: vi.fn()
  }
}));

// Mock Steam bridge upload：每个测试可按需覆盖返回值
const uploadSteamImageMock = vi.fn();
vi.mock("../steamBridge", () => ({
  uploadSteamImage: (...args: unknown[]) => uploadSteamImageMock(...args),
  fetchSteamGuideImages: vi.fn().mockResolvedValue([])
}));

// Debounced storage sync
vi.mock("../../stores/utils/debouncedStorage", () => ({
  createDebouncedStorage: () => ({
    getItem: (name: string) => {
      const str = localStorage.getItem(name);
      if (!str) return null;
      try { return JSON.parse(str); } catch { return null; }
    },
    setItem: (name: string, value: unknown) => {
      localStorage.setItem(name, JSON.stringify(value));
    },
    removeItem: (name: string) => {
      localStorage.removeItem(name);
    },
    flush: () => {}
  })
}));

// ============================================================================
// jsdom 适配：polyfill Blob.arrayBuffer + stub crypto.subtle.digest + fetch
// （与 imagePoolIntake.test.ts 相同思路，未来可抽到 setup.ts）
// ============================================================================

const polyfillArrayBuffer = function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (!(result instanceof ArrayBuffer)) {
        reject(new Error("FileReader 未返回 ArrayBuffer"));
        return;
      }
      const view = new Uint8Array(result);
      const copy = new ArrayBuffer(view.byteLength);
      new Uint8Array(copy).set(view);
      resolve(copy);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(this);
  });
};
(Blob.prototype as unknown as { arrayBuffer: typeof polyfillArrayBuffer }).arrayBuffer = polyfillArrayBuffer;
(File.prototype as unknown as { arrayBuffer: typeof polyfillArrayBuffer }).arrayBuffer = polyfillArrayBuffer;

const stubDigest = async (_algo: string, data: BufferSource): Promise<ArrayBuffer> => {
  const view = data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : new Uint8Array(
        (data as ArrayBufferView).buffer,
        (data as ArrayBufferView).byteOffset,
        (data as ArrayBufferView).byteLength
      );
  let h = 2166136261;
  for (let i = 0; i < view.length; i++) {
    h ^= view[i];
    h = Math.imul(h, 16777619);
  }
  const out = new ArrayBuffer(32);
  const v = new DataView(out);
  for (let i = 0; i < 8; i++) v.setUint32(i * 4, h ^ i, false);
  return out;
};
Object.defineProperty(globalThis.crypto, "subtle", {
  configurable: true,
  writable: true,
  value: { digest: stubDigest }
});

// Mock fetch：队列会 fetch(image.localUrl) → blob()
// 返回一个 100 字节的 blob，type=image/png
const mockBlob = new Blob([new Uint8Array(100)], { type: "image/png" });
globalThis.fetch = vi.fn(async () => ({
  blob: async () => mockBlob
})) as unknown as typeof fetch;

// URL.createObjectURL stub
let urlCounter = 0;
beforeEach(() => {
  urlCounter = 0;
  globalThis.URL.createObjectURL = (() => `blob:mock/${++urlCounter}`) as typeof URL.createObjectURL;
  globalThis.URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

// ============================================================================
// 工具
// ============================================================================

interface ServiceContext {
  service: typeof import("../ImageUploadService").ImageUploadService;
  steamStore: typeof import("../../stores/useSteamGuideImageStore").useSteamGuideImageStore;
}

async function loadFresh(): Promise<ServiceContext> {
  vi.resetModules();
  const svcMod = await import("../ImageUploadService");
  const steamMod = await import("../../stores/useSteamGuideImageStore");
  await Promise.resolve();
  await Promise.resolve();
  return {
    service: svcMod.ImageUploadService,
    steamStore: steamMod.useSteamGuideImageStore
  };
}

/**
 * 快速构造一张 pending 的 ImageWithState
 */
function makePendingImage(fileName: string, fileSize = 1024): import("../../stores/useSteamGuideImageStore").ImageWithState {
  return {
    previewId: "",
    fileName,
    thumbnailUrl: `blob:mock/${fileName}`,
    localUrl: `blob:mock/${fileName}`,
    state: "pending",
    uploadProgress: 0,
    contentHash: `hash-${fileName}`,
    linkedGuideId: undefined,
    fileSize
  };
}

// ============================================================================
// queuePoolUpload 同步守卫
// ============================================================================
describe("queuePoolUpload 同步守卫", () => {
  it("文件大小超限 → setImageState(error) + 不入队", async () => {
    const ctx = await loadFresh();
    const img = makePendingImage("big.png", 2 * 1024 * 1024 + 1);
    // 先放进 store 供 setImageState 查找
    ctx.steamStore.setState({ items: [img] });

    ctx.service.queuePoolUpload(img);

    const queueState = ctx.service.getPoolQueueState();
    expect(queueState.queue).toHaveLength(0);
    // 图片被标记 error
    const stored = ctx.steamStore.getState().items.find(i => i.fileName === "big.png");
    expect(stored?.state).toBe("error");
  });

  it("已有 previewId + state=success → 直接 skip 不入队", async () => {
    const ctx = await loadFresh();
    const uploaded: import("../../stores/useSteamGuideImageStore").ImageWithState = {
      ...makePendingImage("done.png"),
      previewId: "abc123",
      state: "success"
    };
    ctx.service.queuePoolUpload(uploaded);
    expect(ctx.service.getPoolQueueState().queue).toHaveLength(0);
    expect(ctx.service.getPoolQueueState().skippedCount).toBe(0);
  });

  it("池中已存在同名已上传图片 → setPreviewId + skippedCount++", async () => {
    const ctx = await loadFresh();
    const existing: import("../../stores/useSteamGuideImageStore").ImageWithState = {
      ...makePendingImage("x.png"),
      previewId: "old-preview-id",
      state: "success"
    };
    ctx.steamStore.setState({ items: [existing] });

    // 再 queue 一张同名的 pending（模拟重复添加）
    const duplicate: import("../../stores/useSteamGuideImageStore").ImageWithState = {
      ...makePendingImage("x.png"),
      previewId: ""
    };
    // duplicate 需要在 items 里才能让 setPreviewId 作用
    ctx.steamStore.setState({ items: [existing, duplicate] });

    ctx.service.queuePoolUpload(duplicate);

    const queueState = ctx.service.getPoolQueueState();
    expect(queueState.queue).toHaveLength(0);
    expect(queueState.skippedCount).toBe(1);
    // setPreviewId 把 existing 的 previewId 继承给 duplicate
    const updated = ctx.steamStore.getState().items.find(i => i.fileName === "x.png" && i.previewId === "old-preview-id");
    expect(updated).toBeDefined();
  });

  it("已在队列中 → 第二次 queue 被忽略", async () => {
    const ctx = await loadFresh();
    // 让 uploadSteamImage 挂起，避免队列一入队就处理完
    uploadSteamImageMock.mockImplementation(() => new Promise(() => {}));

    const img = makePendingImage("a.png");
    ctx.steamStore.setState({ items: [img] });

    ctx.service.queuePoolUpload(img);
    // 同一个 image 再入队
    ctx.service.queuePoolUpload(img);

    const queueState = ctx.service.getPoolQueueState();
    // 一条在队列 + 一条在 currentItem，总共 1 条在 processing 中
    const total = queueState.queue.length + (queueState.currentItem ? 1 : 0);
    expect(total).toBe(1);
  });
});

// ============================================================================
// queuePoolBatchUpload 循环入队
// ============================================================================
describe("queuePoolBatchUpload", () => {
  it("批量入队调用 queuePoolUpload 多次", async () => {
    const ctx = await loadFresh();
    // 挂起上传避免立即清空
    uploadSteamImageMock.mockImplementation(() => new Promise(() => {}));

    const images = [
      makePendingImage("a.png"),
      makePendingImage("b.png"),
      makePendingImage("c.png")
    ];
    ctx.steamStore.setState({ items: images });

    ctx.service.queuePoolBatchUpload(images);

    const queueState = ctx.service.getPoolQueueState();
    // 1 条在 currentItem + 2 条在 queue
    const total = queueState.queue.length + (queueState.currentItem ? 1 : 0);
    expect(total).toBe(3);
  });

  it("批量中有超限文件 → 超限的被跳过（不入队）", async () => {
    const ctx = await loadFresh();
    uploadSteamImageMock.mockImplementation(() => new Promise(() => {}));

    const normal = makePendingImage("ok.png", 1024);
    const oversize = makePendingImage("big.png", 3 * 1024 * 1024);
    ctx.steamStore.setState({ items: [normal, oversize] });

    ctx.service.queuePoolBatchUpload([normal, oversize]);

    const queueState = ctx.service.getPoolQueueState();
    const total = queueState.queue.length + (queueState.currentItem ? 1 : 0);
    expect(total).toBe(1);
    // 超限的 big.png 被标记 error
    expect(ctx.steamStore.getState().items.find(i => i.fileName === "big.png")?.state).toBe("error");
  });
});

// ============================================================================
// 队列快照与订阅
// ============================================================================
describe("getPoolQueueState / subscribePoolQueue", () => {
  it("初始状态快照", async () => {
    const ctx = await loadFresh();
    const state = ctx.service.getPoolQueueState();
    expect(state.status).toBe("idle");
    expect(state.queue).toEqual([]);
    expect(state.currentItem).toBeNull();
    expect(state.completedCount).toBe(0);
    expect(state.failedCount).toBe(0);
    expect(state.skippedCount).toBe(0);
  });

  it("subscribe 被调用，取消订阅后不再触发", async () => {
    const ctx = await loadFresh();
    uploadSteamImageMock.mockImplementation(() => new Promise(() => {}));

    const listener = vi.fn();
    const unsub = ctx.service.subscribePoolQueue(listener);
    const img = makePendingImage("a.png");
    ctx.steamStore.setState({ items: [img] });
    ctx.service.queuePoolUpload(img);

    expect(listener).toHaveBeenCalled();
    const callsBeforeUnsub = listener.mock.calls.length;

    unsub();
    // 再触发一次状态变化
    ctx.service.dequeuePoolImage("a.png");
    expect(listener.mock.calls.length).toBe(callsBeforeUnsub);
  });

  it("dequeuePoolImage 从队列中移除已入队项", async () => {
    const ctx = await loadFresh();
    uploadSteamImageMock.mockImplementation(() => new Promise(() => {}));

    const a = makePendingImage("a.png");
    const b = makePendingImage("b.png");
    ctx.steamStore.setState({ items: [a, b] });

    ctx.service.queuePoolBatchUpload([a, b]);
    // a 会变成 currentItem，b 在队列
    ctx.service.dequeuePoolImage("b.png");

    const state = ctx.service.getPoolQueueState();
    expect(state.queue).toHaveLength(0);
  });
});

// ============================================================================
// 队列处理：成功路径
// ============================================================================
describe("队列处理 — 成功路径", () => {
  it("单张上传成功 → setPreviewId + completedCount++", async () => {
    const ctx = await loadFresh();
    uploadSteamImageMock.mockResolvedValue({ previewIds: ["preview-1"] });

    const img = makePendingImage("a.png");
    ctx.steamStore.setState({ items: [img] });

    ctx.service.queuePoolUpload(img);

    // 让所有 microtask 跑完（uploadPoolItem 是 async，内部有 fetch/await 链）
    await vi.waitFor(() => {
      expect(ctx.service.getPoolQueueState().completedCount).toBe(1);
    }, { timeout: 2000 });

    // 图片 previewId 已写回
    const updated = ctx.steamStore.getState().items.find(i => i.fileName === "a.png");
    expect(updated?.previewId).toBe("preview-1");
    expect(uploadSteamImageMock).toHaveBeenCalledWith("chapter-preview", expect.any(File), "a.png");
  });

  it("uploadSteamImage 返回空 previewIds → 视为失败并重试最终 failedCount++", async () => {
    vi.useFakeTimers();
    const ctx = await loadFresh();
    uploadSteamImageMock.mockResolvedValue({ previewIds: [] });

    const img = makePendingImage("a.png");
    ctx.steamStore.setState({ items: [img] });
    ctx.service.queuePoolUpload(img);

    // 初始尝试 + 2 次重试，每次间隔 retryDelay 3000ms
    await vi.advanceTimersByTimeAsync(10000);

    expect(ctx.service.getPoolQueueState().failedCount).toBe(1);
    expect(uploadSteamImageMock).toHaveBeenCalledTimes(3); // 初始 + 2 重试
  });
});

// ============================================================================
// 队列处理：Error 29 去重
// ============================================================================
describe("队列处理 — Error 29 去重", () => {
  it("抛 Error 29 → 立即 skip 不重试", async () => {
    const ctx = await loadFresh();
    uploadSteamImageMock.mockRejectedValue(new Error("错误码 29 DuplicateRequest"));

    const img = makePendingImage("dup.png");
    ctx.steamStore.setState({ items: [img] });
    ctx.service.queuePoolUpload(img);

    await vi.waitFor(() => {
      expect(ctx.service.getPoolQueueState().skippedCount).toBe(1);
    }, { timeout: 2000 });

    // 只调用了一次（没有重试）
    expect(uploadSteamImageMock).toHaveBeenCalledTimes(1);
    expect(ctx.service.getPoolQueueState().failedCount).toBe(0);
    // 注：Error 29 分支调用 store.refresh() 拉 steamBridge（mock 返回 []），
    // 会覆盖 items，所以只断言 skippedCount + 调用次数，不断言 items 状态
  });

  it("错误消息包含 'duplicate' 关键字 → 也视为 Error 29", async () => {
    const ctx = await loadFresh();
    uploadSteamImageMock.mockRejectedValue(new Error("image already exists"));

    const img = makePendingImage("x.png");
    ctx.steamStore.setState({ items: [img] });
    ctx.service.queuePoolUpload(img);

    await vi.waitFor(() => {
      expect(ctx.service.getPoolQueueState().skippedCount).toBe(1);
    }, { timeout: 2000 });
    expect(uploadSteamImageMock).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// 队列处理：一般错误 + 重试
// ============================================================================
describe("队列处理 — 一般错误重试", () => {
  it("连续失败 → 重试到 maxRetries=2 后 failedCount++", async () => {
    vi.useFakeTimers();
    const ctx = await loadFresh();
    uploadSteamImageMock.mockRejectedValue(new Error("network down"));

    const img = makePendingImage("net.png");
    ctx.steamStore.setState({ items: [img] });
    ctx.service.queuePoolUpload(img);

    // 初始 + 2 次重试 = 3 次调用，每次重试间隔 3000ms
    await vi.advanceTimersByTimeAsync(10000);

    expect(uploadSteamImageMock).toHaveBeenCalledTimes(3);
    expect(ctx.service.getPoolQueueState().failedCount).toBe(1);
    expect(ctx.steamStore.getState().items.find(i => i.fileName === "net.png")?.state).toBe("error");
  });

  it("第一次失败，第二次成功 → completedCount++ 且只失败一次", async () => {
    vi.useFakeTimers();
    const ctx = await loadFresh();
    uploadSteamImageMock
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValue({ previewIds: ["p-after-retry"] });

    const img = makePendingImage("retry.png");
    ctx.steamStore.setState({ items: [img] });
    ctx.service.queuePoolUpload(img);

    await vi.advanceTimersByTimeAsync(10000);

    expect(ctx.service.getPoolQueueState().completedCount).toBe(1);
    expect(ctx.service.getPoolQueueState().failedCount).toBe(0);
    expect(uploadSteamImageMock).toHaveBeenCalledTimes(2);
    expect(ctx.steamStore.getState().items.find(i => i.fileName === "retry.png")?.previewId).toBe("p-after-retry");
  });
});
