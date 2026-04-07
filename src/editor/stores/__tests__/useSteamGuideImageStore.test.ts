/**
 * useSteamGuideImageStore 测试
 *
 * 覆盖：
 * - addLocalImage：首次添加 / 哈希去重（已上传、本地重复）/ 文件名冲突自动重命名 / linkedGuideId
 * - setImageState / setPreviewId / setUploadProgress：状态机（含 previewId + fileName 双 key 匹配）
 * - 查询：getPendingImages / getImagesByState / getImageById
 * - removeItem：按 previewId 移除
 * - renameImage：只允许 rename pending 状态图片
 * - refresh：成功合并（Steam success + 本地 pending/uploading 保留） / 失败 error 状态 / 连接错误提示
 * - loadFromArchive：无 guideId / 有缓存 ready / 无缓存 idle / loading 状态跳过
 * - getImagesByGuide：success 无 linkedGuideId 宽松匹配 / 严格按 guideId 过滤
 * - partialize：只持久化 pending 状态图片
 *
 * Mock 策略：
 * - mock steamBridge.fetchSteamGuideImages（closure-captured mock）
 * - mock useImageStore（避免 syncFromSteamPool 引发其他 store 副作用）
 * - 真实使用 useGuideStore / useArchiveStore（与既有 store 测试一致）
 * - 复用 4.1-4.3 的 Blob.arrayBuffer / crypto.subtle.digest 垫片
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SteamGuideImage } from "../../../shared/messages";

// ============================================================================
// Mock：在 import 被测模块之前 hoist
// ============================================================================

const fetchSteamGuideImagesMock = vi.fn();

vi.mock("../../services/steamBridge", () => ({
  fetchSteamGuideImages: (...args: unknown[]) => fetchSteamGuideImagesMock(...args)
}));

// useImageStore.syncFromSteamPool 在 refresh 结尾被调用，不关心其内部行为，
// 只确保被调用不会崩。真实 useImageStore 有自己的 persist，mock 更安全。
const syncFromSteamPoolMock = vi.fn();
vi.mock("../useImageStore", () => ({
  useImageStore: {
    getState: () => ({
      syncFromSteamPool: syncFromSteamPoolMock
    })
  }
}));

// ============================================================================
// jsdom 适配：Blob.arrayBuffer polyfill + crypto.subtle.digest stub
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

const stubDigest = async (
  _algo: string,
  data: BufferSource
): Promise<ArrayBuffer> => {
  const view = data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : new Uint8Array(
        (data as ArrayBufferView).buffer,
        (data as ArrayBufferView).byteOffset,
        (data as ArrayBufferView).byteLength
      );
  // FNV-1a 32 位哈希，扩展到 32 字节
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

// ============================================================================
// URL.createObjectURL stub
// ============================================================================

let urlCounter = 0;
beforeEach(() => {
  urlCounter = 0;
  globalThis.URL.createObjectURL = (() => `blob:mock/${++urlCounter}`) as typeof URL.createObjectURL;
  globalThis.URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
  fetchSteamGuideImagesMock.mockReset();
  syncFromSteamPoolMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// 工具
// ============================================================================

interface StoreContext {
  store: typeof import("../useSteamGuideImageStore").useSteamGuideImageStore;
  guideStore: typeof import("../useGuideStore").useGuideStore;
  archiveStore: typeof import("../useArchiveStore").useArchiveStore;
}

async function loadFresh(): Promise<StoreContext> {
  vi.resetModules();
  const mod = await import("../useSteamGuideImageStore");
  const guideMod = await import("../useGuideStore");
  const archiveMod = await import("../useArchiveStore");
  await Promise.resolve();
  return {
    store: mod.useSteamGuideImageStore,
    guideStore: guideMod.useGuideStore,
    archiveStore: archiveMod.useArchiveStore
  };
}

/**
 * 构造 File。同 size 不同 seed → 不同内容 → 不同 contentHash。
 */
function makeFile(name: string, size = 1024, seed = 0): File {
  const bytes = new Uint8Array(size);
  if (seed !== 0) {
    for (let i = 0; i < Math.min(8, size); i++) {
      bytes[i] = (seed + i) & 0xff;
    }
  }
  return new File([bytes], name, { type: "image/png", lastModified: 1700000000000 });
}

function makeSteamImage(previewId: string, fileName: string): SteamGuideImage {
  return {
    previewId,
    fileName,
    thumbnailUrl: `https://steam.example/${previewId}.jpg`,
    originalUrl: `https://steam.example/${previewId}_orig.jpg`
  };
}

// ============================================================================
// addLocalImage
// ============================================================================
describe("addLocalImage", () => {
  it("首次添加 → skipped=false 且 items +1", async () => {
    const ctx = await loadFresh();
    const file = makeFile("a.png", 1024, 1);
    const result = await ctx.store.getState().addLocalImage(file);
    expect(result.skipped).toBe(false);
    expect(result.image.fileName).toBe("a.png");
    expect(result.image.state).toBe("pending");
    expect(result.image.contentHash).toBeTruthy();
    expect(result.image.fileSize).toBe(1024);
    expect(result.image.localUrl).toBeTruthy();
    expect(ctx.store.getState().items).toHaveLength(1);
  });

  it("同内容 + 已上传（success） → skipped reason=duplicate_uploaded", async () => {
    const ctx = await loadFresh();
    // 先添加并标记为已上传
    const file1 = makeFile("a.png", 1024, 42);
    await ctx.store.getState().addLocalImage(file1);
    ctx.store.getState().setPreviewId("a.png", "P1");
    // 再添加相同内容但不同文件名
    const file2 = makeFile("b.png", 1024, 42);
    const result = await ctx.store.getState().addLocalImage(file2);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("duplicate_uploaded");
    expect(result.existingFileName).toBe("a.png");
    expect(ctx.store.getState().items).toHaveLength(1);
  });

  it("同内容 + 本地 pending → skipped reason=duplicate_local", async () => {
    const ctx = await loadFresh();
    const file1 = makeFile("a.png", 1024, 7);
    await ctx.store.getState().addLocalImage(file1);
    const file2 = makeFile("c.png", 1024, 7);
    const result = await ctx.store.getState().addLocalImage(file2);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("duplicate_local");
    expect(result.existingFileName).toBe("a.png");
    expect(ctx.store.getState().items).toHaveLength(1);
  });

  it("不同内容 + 同文件名 → 自动重命名 a.png → a_2.png", async () => {
    const ctx = await loadFresh();
    await ctx.store.getState().addLocalImage(makeFile("a.png", 1024, 1));
    const result = await ctx.store.getState().addLocalImage(makeFile("a.png", 1024, 2));
    expect(result.skipped).toBe(false);
    expect(result.image.fileName).toBe("a_2.png");
    expect(ctx.store.getState().items).toHaveLength(2);
  });

  it("多次冲突递增：a.png → a_2.png → a_3.png", async () => {
    const ctx = await loadFresh();
    await ctx.store.getState().addLocalImage(makeFile("a.png", 1024, 1));
    await ctx.store.getState().addLocalImage(makeFile("a.png", 1024, 2));
    const third = await ctx.store.getState().addLocalImage(makeFile("a.png", 1024, 3));
    expect(third.image.fileName).toBe("a_3.png");
  });

  it("linkedGuideId 被写入 ImageWithState", async () => {
    const ctx = await loadFresh();
    const r = await ctx.store.getState().addLocalImage(makeFile("a.png", 1024, 1), "G-123");
    expect(r.image.linkedGuideId).toBe("G-123");
  });

  it("无扩展名文件冲突也能递增", async () => {
    const ctx = await loadFresh();
    await ctx.store.getState().addLocalImage(makeFile("noext", 1024, 1));
    const r = await ctx.store.getState().addLocalImage(makeFile("noext", 1024, 2));
    expect(r.image.fileName).toBe("noext_2");
  });
});

// ============================================================================
// 状态管理：setImageState / setPreviewId / setUploadProgress
// ============================================================================
describe("setImageState / setPreviewId / setUploadProgress", () => {
  it("setImageState 通过 fileName 匹配 pending 图片", async () => {
    const ctx = await loadFresh();
    await ctx.store.getState().addLocalImage(makeFile("a.png", 1024, 1));
    ctx.store.getState().setImageState("a.png", "uploading");
    expect(ctx.store.getState().items[0].state).toBe("uploading");
  });

  it("setImageState 通过 previewId 匹配已上传图片", async () => {
    const ctx = await loadFresh();
    await ctx.store.getState().addLocalImage(makeFile("a.png", 1024, 1));
    ctx.store.getState().setPreviewId("a.png", "PREVIEW_X");
    ctx.store.getState().setImageState("PREVIEW_X", "error", "oops");
    const item = ctx.store.getState().items[0];
    expect(item.state).toBe("error");
    expect(item.uploadError).toBe("oops");
  });

  it("setPreviewId 自动转 success 状态", async () => {
    const ctx = await loadFresh();
    await ctx.store.getState().addLocalImage(makeFile("a.png", 1024, 1));
    ctx.store.getState().setPreviewId("a.png", "P1");
    const item = ctx.store.getState().items[0];
    expect(item.previewId).toBe("P1");
    expect(item.state).toBe("success");
  });

  it("setUploadProgress 写入进度", async () => {
    const ctx = await loadFresh();
    await ctx.store.getState().addLocalImage(makeFile("a.png", 1024, 1));
    ctx.store.getState().setUploadProgress("a.png", 50);
    expect(ctx.store.getState().items[0].uploadProgress).toBe(50);
  });
});

// ============================================================================
// 查询
// ============================================================================
describe("查询方法", () => {
  it("getPendingImages 只返回 pending", async () => {
    const ctx = await loadFresh();
    await ctx.store.getState().addLocalImage(makeFile("a.png", 1024, 1));
    await ctx.store.getState().addLocalImage(makeFile("b.png", 1024, 2));
    ctx.store.getState().setPreviewId("b.png", "P_B");
    const pending = ctx.store.getState().getPendingImages();
    expect(pending).toHaveLength(1);
    expect(pending[0].fileName).toBe("a.png");
  });

  it("getImagesByState 按状态过滤", async () => {
    const ctx = await loadFresh();
    await ctx.store.getState().addLocalImage(makeFile("a.png", 1024, 1));
    await ctx.store.getState().addLocalImage(makeFile("b.png", 1024, 2));
    ctx.store.getState().setImageState("b.png", "error", "fail");
    expect(ctx.store.getState().getImagesByState("error")).toHaveLength(1);
    expect(ctx.store.getState().getImagesByState("pending")).toHaveLength(1);
  });

  it("getImageById 支持 fileName 和 previewId 双 key", async () => {
    const ctx = await loadFresh();
    await ctx.store.getState().addLocalImage(makeFile("a.png", 1024, 1));
    expect(ctx.store.getState().getImageById("a.png")?.fileName).toBe("a.png");
    ctx.store.getState().setPreviewId("a.png", "P1");
    expect(ctx.store.getState().getImageById("P1")?.previewId).toBe("P1");
    expect(ctx.store.getState().getImageById("unknown")).toBeUndefined();
  });
});

// ============================================================================
// removeItem
// ============================================================================
describe("removeItem", () => {
  it("按 previewId 移除", async () => {
    const ctx = await loadFresh();
    await ctx.store.getState().addLocalImage(makeFile("a.png", 1024, 1));
    await ctx.store.getState().addLocalImage(makeFile("b.png", 1024, 2));
    ctx.store.getState().setPreviewId("a.png", "P_A");
    ctx.store.getState().removeItem("P_A");
    expect(ctx.store.getState().items).toHaveLength(1);
    expect(ctx.store.getState().items[0].fileName).toBe("b.png");
  });

  it("未知 previewId 无副作用", async () => {
    const ctx = await loadFresh();
    await ctx.store.getState().addLocalImage(makeFile("a.png", 1024, 1));
    ctx.store.getState().removeItem("NOT_EXIST");
    expect(ctx.store.getState().items).toHaveLength(1);
  });
});

// ============================================================================
// renameImage
// ============================================================================
describe("renameImage", () => {
  it("只允许 rename pending 图片", async () => {
    const ctx = await loadFresh();
    await ctx.store.getState().addLocalImage(makeFile("a.png", 1024, 1));
    ctx.store.getState().renameImage("a.png", "new.png");
    expect(ctx.store.getState().items[0].fileName).toBe("new.png");
  });

  it("success 状态图片 rename 无效", async () => {
    const ctx = await loadFresh();
    await ctx.store.getState().addLocalImage(makeFile("a.png", 1024, 1));
    ctx.store.getState().setPreviewId("a.png", "P1");
    ctx.store.getState().renameImage("P1", "new.png");
    expect(ctx.store.getState().items[0].fileName).toBe("a.png");
  });

  it("未知 imageId 无副作用", async () => {
    const ctx = await loadFresh();
    await ctx.store.getState().addLocalImage(makeFile("a.png", 1024, 1));
    ctx.store.getState().renameImage("unknown", "new.png");
    expect(ctx.store.getState().items[0].fileName).toBe("a.png");
  });
});

// ============================================================================
// refresh
// ============================================================================
describe("refresh", () => {
  it("成功拉取 → 状态变 ready 且 items 包含 Steam 图片", async () => {
    const ctx = await loadFresh();
    fetchSteamGuideImagesMock.mockResolvedValueOnce([
      makeSteamImage("P1", "steam1.jpg"),
      makeSteamImage("P2", "steam2.jpg")
    ]);
    await ctx.store.getState().refresh();
    const state = ctx.store.getState();
    expect(state.status).toBe("ready");
    expect(state.items).toHaveLength(2);
    expect(state.items[0].state).toBe("success");
    expect(syncFromSteamPoolMock).toHaveBeenCalledOnce();
  });

  it("成功拉取 → 保留当前存档的 pending 本地图片", async () => {
    const ctx = await loadFresh();
    // 先设置 currentArchiveId 以便 linkedGuideId 一致
    ctx.guideStore.setState({ currentArchiveId: "G1" });
    await ctx.store.getState().addLocalImage(makeFile("local.png", 1024, 1), "G1");

    fetchSteamGuideImagesMock.mockResolvedValueOnce([
      makeSteamImage("P1", "steam.jpg")
    ]);
    await ctx.store.getState().refresh();

    const items = ctx.store.getState().items;
    // Steam 图片 + 本地 pending 图片都在
    expect(items).toHaveLength(2);
    expect(items.find(i => i.fileName === "local.png")?.state).toBe("pending");
    expect(items.find(i => i.fileName === "steam.jpg")?.state).toBe("success");
  });

  it("成功拉取 → 丢弃非当前存档的 pending 图片", async () => {
    const ctx = await loadFresh();
    ctx.guideStore.setState({ currentArchiveId: "G1" });
    // 旧存档 G_OLD 的本地图片
    await ctx.store.getState().addLocalImage(makeFile("old.png", 1024, 1), "G_OLD");

    fetchSteamGuideImagesMock.mockResolvedValueOnce([]);
    await ctx.store.getState().refresh();

    const items = ctx.store.getState().items;
    expect(items.find(i => i.fileName === "old.png")).toBeUndefined();
  });

  it("失败 → 状态变 error 并写入错误信息", async () => {
    const ctx = await loadFresh();
    fetchSteamGuideImagesMock.mockRejectedValue(new Error("network down"));
    await ctx.store.getState().refresh();
    const state = ctx.store.getState();
    expect(state.status).toBe("error");
    expect(state.error).toContain("network down");
  });

  it("连接错误 → 返回用户友好提示", async () => {
    const ctx = await loadFresh();
    fetchSteamGuideImagesMock.mockRejectedValue(
      new Error("Could not establish connection. Receiving end does not exist.")
    );
    await ctx.store.getState().refresh();
    expect(ctx.store.getState().error).toBe("无法连接到 Steam 页面，请确保已打开指南编辑页面");
  });

  it("成功 + 当前存档 → 更新存档 cachedImages", async () => {
    const ctx = await loadFresh();
    ctx.archiveStore.getState().createArchive("G1", { title: "t", chapters: [] });
    ctx.guideStore.setState({ currentArchiveId: "G1" });

    const steamImages = [makeSteamImage("P1", "a.jpg")];
    fetchSteamGuideImagesMock.mockResolvedValueOnce(steamImages);
    await ctx.store.getState().refresh();

    const archive = ctx.archiveStore.getState().getArchive("G1");
    expect(archive?.cachedImages).toEqual(steamImages);
    expect(archive?.imagesUpdatedAt).toBeGreaterThan(0);
  });
});

// ============================================================================
// loadFromArchive
// ============================================================================
describe("loadFromArchive", () => {
  it("无 guideId → 清空 Steam 图片但保留本地", async () => {
    const ctx = await loadFresh();
    // 先添加 Steam 图片
    fetchSteamGuideImagesMock.mockResolvedValueOnce([makeSteamImage("P1", "a.jpg")]);
    await ctx.store.getState().refresh();
    // 再添加本地图片
    await ctx.store.getState().addLocalImage(makeFile("local.png", 1024, 1));

    ctx.store.getState().loadFromArchive(null);
    const items = ctx.store.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].fileName).toBe("local.png");
    expect(ctx.store.getState().status).toBe("idle");
  });

  it("有 guideId + 有缓存 → 直接 ready 不触发 refresh", async () => {
    const ctx = await loadFresh();
    const cached = [makeSteamImage("P1", "cached.jpg")];
    ctx.archiveStore.getState().createArchive("G1", { title: "t", chapters: [] });
    ctx.archiveStore.getState().updateArchive("G1", { cachedImages: cached });

    ctx.store.getState().loadFromArchive("G1");
    const state = ctx.store.getState();
    expect(state.status).toBe("ready");
    expect(state.items).toHaveLength(1);
    expect(state.items[0].fileName).toBe("cached.jpg");
    expect(fetchSteamGuideImagesMock).not.toHaveBeenCalled();
  });

  it("有 guideId + 无缓存 + triggerRefresh=true → status=idle", async () => {
    const ctx = await loadFresh();
    ctx.archiveStore.getState().createArchive("G1", { title: "t", chapters: [] });

    ctx.store.getState().loadFromArchive("G1", true);
    expect(ctx.store.getState().status).toBe("idle");
  });

  it("有 guideId + 无缓存 + triggerRefresh=false → status=ready（显示空）", async () => {
    const ctx = await loadFresh();
    ctx.archiveStore.getState().createArchive("G1", { title: "t", chapters: [] });

    ctx.store.getState().loadFromArchive("G1", false);
    expect(ctx.store.getState().status).toBe("ready");
    expect(ctx.store.getState().items).toHaveLength(0);
  });

  it("loading 状态 → 跳过 loadFromArchive", async () => {
    const ctx = await loadFresh();
    ctx.store.setState({ status: "loading" });
    // Pre-populate an item we can use to detect if loadFromArchive mutated state
    ctx.store.setState({
      items: [{
        previewId: "P_EXIST",
        fileName: "exist.jpg",
        state: "success"
      }]
    });
    ctx.store.getState().loadFromArchive("G1");
    // 状态没变
    expect(ctx.store.getState().status).toBe("loading");
    expect(ctx.store.getState().items).toHaveLength(1);
  });
});

// ============================================================================
// getImagesByGuide
// ============================================================================
describe("getImagesByGuide", () => {
  it("success 无 linkedGuideId → 宽松匹配所有查询", async () => {
    const ctx = await loadFresh();
    ctx.store.setState({
      items: [{
        previewId: "P1",
        fileName: "old.jpg",
        state: "success"
        // 故意不设 linkedGuideId
      }]
    });
    expect(ctx.store.getState().getImagesByGuide("G1")).toHaveLength(1);
    expect(ctx.store.getState().getImagesByGuide("G2")).toHaveLength(1);
  });

  it("success 有 linkedGuideId → 严格按 guideId 过滤", async () => {
    const ctx = await loadFresh();
    ctx.store.setState({
      items: [
        { previewId: "P1", fileName: "a.jpg", state: "success", linkedGuideId: "G1" },
        { previewId: "P2", fileName: "b.jpg", state: "success", linkedGuideId: "G2" }
      ]
    });
    expect(ctx.store.getState().getImagesByGuide("G1")).toHaveLength(1);
    expect(ctx.store.getState().getImagesByGuide("G1")[0].fileName).toBe("a.jpg");
    // null 查询：success 有 linkedGuideId 时不匹配 null
    expect(ctx.store.getState().getImagesByGuide(null)).toHaveLength(0);
  });

  it("pending 本地图片严格按 linkedGuideId 过滤", async () => {
    const ctx = await loadFresh();
    await ctx.store.getState().addLocalImage(makeFile("a.png", 1024, 1), "G1");
    await ctx.store.getState().addLocalImage(makeFile("b.png", 1024, 2), "G2");
    expect(ctx.store.getState().getImagesByGuide("G1")).toHaveLength(1);
    expect(ctx.store.getState().getImagesByGuide("G1")[0].fileName).toBe("a.png");
  });

  it("pending 无 linkedGuideId → 只匹配 null 查询", async () => {
    const ctx = await loadFresh();
    await ctx.store.getState().addLocalImage(makeFile("a.png", 1024, 1));
    expect(ctx.store.getState().getImagesByGuide(null)).toHaveLength(1);
    expect(ctx.store.getState().getImagesByGuide("G1")).toHaveLength(0);
  });
});

// ============================================================================
// persist 序列化
// ============================================================================
describe("persist partialize", () => {
  it("只持久化 pending 图片，success 图片不进 localStorage", async () => {
    const ctx = await loadFresh();
    // 先让 persist 有机会 rehydrate
    await ctx.store.getState().addLocalImage(makeFile("pending.png", 1024, 1));
    await ctx.store.getState().addLocalImage(makeFile("uploaded.png", 1024, 2));
    ctx.store.getState().setPreviewId("uploaded.png", "P_UP");

    // 触发持久化
    await Promise.resolve();

    const raw = localStorage.getItem("nasge-image-pool");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    const persistedItems = parsed.state.items as Array<{ fileName: string; state: string }>;
    // 只有 pending 被持久化
    expect(persistedItems.every(i => i.state === "pending")).toBe(true);
    expect(persistedItems.some(i => i.fileName === "pending.png")).toBe(true);
    expect(persistedItems.some(i => i.fileName === "uploaded.png")).toBe(false);
  });
});
