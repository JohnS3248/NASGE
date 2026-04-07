/**
 * imagePoolIntake 测试 — 单图入池路径
 *
 * 覆盖：
 * - 单图合规：正常入池 + addPendingUploadAfterRename / queuePoolBatchUpload 分流
 * - 单图超限：弹窗阻止 + 不入池
 * - 无名剪贴板图片：MIME → 文件名补全
 * - openPanelOnAdd 触发面板打开
 *
 * Mock 策略：
 * - 不 mock useSteamGuideImageStore（直接观察 items 变化）
 * - mock ImageUploadService（避免真实上传）
 * - mock dialog.confirm（同步 resolve）
 * - mock i18n（避免初始化）
 * - mock URL.createObjectURL/revokeObjectURL（jsdom 实现不稳定）
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// Mock：在 import 被测模块之前 hoist
// ============================================================================

vi.mock("../../../i18n", () => ({
  i18n: { changeLanguage: vi.fn() },
  resolveLocale: (l: string) => (l === "auto" ? "zh-CN" : l)
}));

vi.mock("i18next", () => ({
  default: {
    t: (key: string, opts?: Record<string, unknown>) => {
      // 简单回写 key + 参数，方便 assert
      if (opts) {
        return `${key}|${JSON.stringify(opts)}`;
      }
      return key;
    },
    changeLanguage: vi.fn()
  }
}));

vi.mock("../ImageUploadService", () => ({
  ImageUploadService: {
    queuePoolBatchUpload: vi.fn()
  }
}));

// 让 persist 同步写盘，规避跨 test 竞态（与 useDraftStore.test.ts 相同思路）
vi.mock("../../stores/utils/debouncedStorage", () => ({
  createDebouncedStorage: () => ({
    getItem: (name: string) => {
      const str = localStorage.getItem(name);
      if (!str) return null;
      try {
        return JSON.parse(str);
      } catch {
        return null;
      }
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
// URL.createObjectURL / revokeObjectURL stub（jsdom 不稳定）
// jsdom Blob.slice() 返回的对象缺 arrayBuffer()，computeImageHash 会炸 → 一并 polyfill
// ============================================================================

let urlCounter = 0;
const createdUrls = new Set<string>();
const revokedUrls = new Set<string>();

// jsdom 适配两个问题：
// 1. Blob.slice() 返回的对象没有 arrayBuffer() → polyfill
// 2. polyfill 返回的 ArrayBuffer 视图与 Node webcrypto 跨 realm 不兼容
//    → stub 整个 crypto.subtle.digest
// 我们只关心 computeImageHash 不抛错 + 同内容产生同 hash，不要求密码学正确。

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
  // FNV-1a 32 位哈希，扩展到 32 字节满足 SHA-256 长度
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
// crypto.subtle 是 getter，要用 defineProperty 强行覆盖
Object.defineProperty(globalThis.crypto, "subtle", {
  configurable: true,
  writable: true,
  value: { digest: stubDigest }
});

beforeEach(() => {
  urlCounter = 0;
  createdUrls.clear();
  revokedUrls.clear();
  globalThis.URL.createObjectURL = (() => {
    const url = `blob:mock/${++urlCounter}`;
    createdUrls.add(url);
    return url;
  }) as typeof URL.createObjectURL;
  globalThis.URL.revokeObjectURL = ((url: string) => {
    revokedUrls.add(url);
  }) as typeof URL.revokeObjectURL;
});

afterEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// 工具
// ============================================================================

interface IntakeContext {
  addFilesToPool: typeof import("../imagePoolIntake").addFilesToPool;
  steamImageStore: typeof import("../../stores/useSteamGuideImageStore").useSteamGuideImageStore;
  imagePanelStore: typeof import("../../stores/useImagePanelStore").useImagePanelStore;
  configStore: typeof import("../../stores/useEditorConfigStore").useEditorConfigStore;
  dialogStore: typeof import("../../stores/useDialogStore").useDialogStore;
  ImageUploadService: typeof import("../ImageUploadService").ImageUploadService;
}

async function loadFresh(): Promise<IntakeContext> {
  vi.resetModules();
  const intakeMod = await import("../imagePoolIntake");
  const steamMod = await import("../../stores/useSteamGuideImageStore");
  const panelMod = await import("../../stores/useImagePanelStore");
  const configMod = await import("../../stores/useEditorConfigStore");
  const dialogMod = await import("../../stores/useDialogStore");
  const uploadMod = await import("../ImageUploadService");
  await Promise.resolve();
  await Promise.resolve();
  return {
    addFilesToPool: intakeMod.addFilesToPool,
    steamImageStore: steamMod.useSteamGuideImageStore,
    imagePanelStore: panelMod.useImagePanelStore,
    configStore: configMod.useEditorConfigStore,
    dialogStore: dialogMod.useDialogStore,
    ImageUploadService: uploadMod.ImageUploadService
  };
}

function makeFile(name: string, size: number, type = "image/png"): File {
  // 用 Uint8Array 构造指定大小的 blob，避免 jsdom 把字符串长度当成 byte 长度的歧义
  const bytes = new Uint8Array(size);
  return new File([bytes], name, { type, lastModified: 1700000000000 });
}

/**
 * 自动应答 dialog.confirm —— 在弹窗 open 后立即 resolve(true)
 * 返回一个 unsubscribe 函数。
 */
function autoConfirmDialog(
  dialogStore: IntakeContext["dialogStore"],
  result: boolean = true
): () => void {
  return dialogStore.subscribe((state) => {
    if (state.state.kind === "confirm") {
      const { resolve } = state.state;
      resolve(result);
    }
  });
}

// ============================================================================
// 单图合规入池
// ============================================================================
describe("单图合规入池", () => {
  it("正常 PNG → 入池 + 基本元数据正确（默认 autoUpload=false）", async () => {
    const ctx = await loadFresh();
    const file = makeFile("hello.png", 1024);

    await ctx.addFilesToPool([file], {
      source: "paste",
      currentArchiveId: "G1",
      openPanelOnAdd: true
    });

    const items = ctx.steamImageStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].fileName).toBe("hello.png");
    expect(items[0].state).toBe("pending");
    expect(items[0].linkedGuideId).toBe("G1");

    // 默认 autoUploadInPanel=false → 既不立即上传也不进 pending 队列
    expect(ctx.ImageUploadService.queuePoolBatchUpload).not.toHaveBeenCalled();
    expect(ctx.imagePanelStore.getState().pendingUploadAfterRename).toEqual([]);
  });

  it("autoUpload=true + promptRename=true → 走 addPendingUploadAfterRename", async () => {
    const ctx = await loadFresh();
    ctx.configStore.getState().setAutoUploadInPanel(true);
    const file = makeFile("hello.png", 1024);

    await ctx.addFilesToPool([file], {
      source: "paste",
      currentArchiveId: "G1",
      openPanelOnAdd: false
    });

    const items = ctx.steamImageStore.getState().items;
    expect(items).toHaveLength(1);
    // 单图 + promptRename=true → 不立即上传
    expect(ctx.ImageUploadService.queuePoolBatchUpload).not.toHaveBeenCalled();
    // 进 pending 队列等待 ImageCard 改名后再上传
    const pending = ctx.imagePanelStore.getState().pendingUploadAfterRename;
    expect(pending).toContain(items[0].fileName);
  });

  it("openPanelOnAdd=true → 面板打开", async () => {
    const ctx = await loadFresh();
    expect(ctx.imagePanelStore.getState().isOpen).toBe(false);
    await ctx.addFilesToPool([makeFile("a.png", 100)], {
      source: "paste",
      currentArchiveId: null,
      openPanelOnAdd: true
    });
    expect(ctx.imagePanelStore.getState().isOpen).toBe(true);
  });

  it("openPanelOnAdd=false → 面板保持关闭", async () => {
    const ctx = await loadFresh();
    await ctx.addFilesToPool([makeFile("a.png", 100)], {
      source: "paste",
      currentArchiveId: null,
      openPanelOnAdd: false
    });
    expect(ctx.imagePanelStore.getState().isOpen).toBe(false);
  });

  it("autoUpload=true + promptRenameOnPaste=false → 立即 queuePoolBatchUpload", async () => {
    const ctx = await loadFresh();
    ctx.configStore.getState().setAutoUploadInPanel(true);
    ctx.configStore.getState().setPromptRenameOnPaste(false);
    await ctx.addFilesToPool([makeFile("a.png", 100)], {
      source: "paste",
      currentArchiveId: null,
      openPanelOnAdd: false
    });
    expect(ctx.ImageUploadService.queuePoolBatchUpload).toHaveBeenCalledTimes(1);
    // 不会进 addPendingUploadAfterRename 队列
    expect(ctx.imagePanelStore.getState().pendingUploadAfterRename).toEqual([]);
  });

  it("autoUploadInPanel=false → 既不 addPending 也不 queuePoolBatch", async () => {
    const ctx = await loadFresh();
    // 默认就是 false，显式 set 一次表达意图
    ctx.configStore.getState().setAutoUploadInPanel(false);
    await ctx.addFilesToPool([makeFile("a.png", 100)], {
      source: "paste",
      currentArchiveId: null,
      openPanelOnAdd: false
    });
    expect(ctx.ImageUploadService.queuePoolBatchUpload).not.toHaveBeenCalled();
    expect(ctx.imagePanelStore.getState().pendingUploadAfterRename).toEqual([]);
    // 但图片已入池
    expect(ctx.steamImageStore.getState().items).toHaveLength(1);
  });

  it("source=drop 使用 promptRenameOnDrop 配置（autoUpload=true）", async () => {
    const ctx = await loadFresh();
    ctx.configStore.getState().setAutoUploadInPanel(true);
    ctx.configStore.getState().setPromptRenameOnDrop(false);
    // promptRenameOnPaste 仍是默认 true，但 source=drop 应只看 onDrop
    await ctx.addFilesToPool([makeFile("a.png", 100)], {
      source: "drop",
      currentArchiveId: null,
      openPanelOnAdd: false
    });
    expect(ctx.ImageUploadService.queuePoolBatchUpload).toHaveBeenCalledTimes(1);
    expect(ctx.imagePanelStore.getState().pendingUploadAfterRename).toEqual([]);
  });
});

// ============================================================================
// 单图超限阻止
// ============================================================================
describe("单图超限阻止", () => {
  it("超过 STEAM_IMAGE_SIZE_LIMIT (2MB) → 弹窗 + 不入池", async () => {
    const ctx = await loadFresh();
    const unsub = autoConfirmDialog(ctx.dialogStore, true);
    const oversize = makeFile("big.png", 2 * 1024 * 1024 + 1);

    await ctx.addFilesToPool([oversize], {
      source: "paste",
      currentArchiveId: null,
      openPanelOnAdd: false
    });

    unsub();
    // 图片池不变
    expect(ctx.steamImageStore.getState().items).toHaveLength(0);
    // 上传服务也不调用
    expect(ctx.ImageUploadService.queuePoolBatchUpload).not.toHaveBeenCalled();
    // 临时 URL 已 revoke
    expect(revokedUrls.size).toBeGreaterThan(0);
  });

  it("正好等于 2MB → 视为合规，正常入池", async () => {
    const ctx = await loadFresh();
    const exact = makeFile("ok.png", 2 * 1024 * 1024);
    await ctx.addFilesToPool([exact], {
      source: "paste",
      currentArchiveId: null,
      openPanelOnAdd: false
    });
    expect(ctx.steamImageStore.getState().items).toHaveLength(1);
  });
});

// ============================================================================
// 无名剪贴板图片补全
// ============================================================================
describe("无名剪贴板图片补全", () => {
  it("空文件名 + image/jpeg → image.jpg", async () => {
    const ctx = await loadFresh();
    // File 构造器要求 name 字段，传 "" 模拟剪贴板未命名图片
    const file = new File([new Uint8Array(100)], "", { type: "image/jpeg" });
    await ctx.addFilesToPool([file], {
      source: "paste",
      currentArchiveId: null,
      openPanelOnAdd: false
    });
    const items = ctx.steamImageStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].fileName).toBe("image.jpg");
  });

  it("默认 image.png 文件名 + image/gif → image.gif", async () => {
    const ctx = await loadFresh();
    const file = new File([new Uint8Array(100)], "image.png", { type: "image/gif" });
    await ctx.addFilesToPool([file], {
      source: "paste",
      currentArchiveId: null,
      openPanelOnAdd: false
    });
    expect(ctx.steamImageStore.getState().items[0].fileName).toBe("image.gif");
  });

  it("默认 image.png 文件名 + image/webp → image.webp", async () => {
    const ctx = await loadFresh();
    const file = new File([new Uint8Array(100)], "image.png", { type: "image/webp" });
    await ctx.addFilesToPool([file], {
      source: "paste",
      currentArchiveId: null,
      openPanelOnAdd: false
    });
    expect(ctx.steamImageStore.getState().items[0].fileName).toBe("image.webp");
  });

  it("默认 image.png 文件名 + 未知 MIME → 保留 image.png", async () => {
    const ctx = await loadFresh();
    const file = new File([new Uint8Array(100)], "image.png", { type: "application/octet-stream" });
    await ctx.addFilesToPool([file], {
      source: "paste",
      currentArchiveId: null,
      openPanelOnAdd: false
    });
    expect(ctx.steamImageStore.getState().items[0].fileName).toBe("image.png");
  });

  it("已有有意义文件名 → 不被覆盖", async () => {
    const ctx = await loadFresh();
    const file = makeFile("screenshot-2025.png", 100, "image/jpeg");
    await ctx.addFilesToPool([file], {
      source: "paste",
      currentArchiveId: null,
      openPanelOnAdd: false
    });
    expect(ctx.steamImageStore.getState().items[0].fileName).toBe("screenshot-2025.png");
  });
});
