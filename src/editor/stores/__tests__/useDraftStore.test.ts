/**
 * useDraftStore 测试
 *
 * 关键策略：
 * - 每个 test 前 vi.resetModules() + 动态 import，获得全新的模块实例与模块级
 *   变量（deletedCache、subscribe、persist middleware）
 * - setup.ts 已 clear localStorage/sessionStorage，每个 test 起点干净
 * - onRehydrateStorage 用 queueMicrotask 延迟恢复 activeDraftId，
 *   import 后必须 await 一个 microtask 才能读到正确状态
 * - debouncedStorage 默认 500ms 防抖，测试中用 vi.useFakeTimers() 控制
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { useDraftStore as UseDraftStoreType, Draft } from "../useDraftStore";

type Store = typeof UseDraftStoreType;

/** 每次 import 后用 resetModules 保证独立状态 */
async function importFreshStore(): Promise<Store> {
  vi.resetModules();
  const mod = await import("../useDraftStore");
  // 等 onRehydrateStorage 的 queueMicrotask 跑完
  await Promise.resolve();
  await Promise.resolve();
  return mod.useDraftStore;
}

beforeEach(() => {
  // setup.ts 已 clear，但 fake timer 要手动开
  vi.useRealTimers();
});

// ============================================================================
// addDraft
// ============================================================================
describe("addDraft", () => {
  it("创建带默认名的空草稿", async () => {
    const store = await importFreshStore();
    const draft = store.getState().addDraft();

    expect(draft.draftName).toBe("草稿 1");
    expect(draft.draftType).toBe("guide");
    expect(draft.id).toBeTruthy();
    expect(draft.updatedAt).toBeGreaterThan(0);
    expect(store.getState().drafts).toHaveLength(1);
    expect(store.getState().activeDraftId).toBe(draft.id);
    expect(store.getState().nextDraftNumber).toBe(2);
  });

  it("使用显式 draftName 覆盖默认", async () => {
    const store = await importFreshStore();
    const draft = store.getState().addDraft({ draftName: "我的草稿" });
    expect(draft.draftName).toBe("我的草稿");
  });

  it("使用 title 生成标题 JSONContent", async () => {
    const store = await importFreshStore();
    const draft = store.getState().addDraft({ title: "Hello" });
    expect(draft.title).toBeDefined();
    expect(draft.title.type).toBe("doc");
  });

  it("创建 review 草稿携带 appId/appName", async () => {
    const store = await importFreshStore();
    const draft = store.getState().addDraft({
      draftType: "review",
      linkedAppId: "730",
      linkedAppName: "CS2"
    });
    expect(draft.draftType).toBe("review");
    expect(draft.linkedAppId).toBe("730");
    expect(draft.linkedAppName).toBe("CS2");
  });

  it("连续创建草稿自动递增编号并切换 active", async () => {
    const store = await importFreshStore();
    const a = store.getState().addDraft();
    const b = store.getState().addDraft();
    expect(a.draftName).toBe("草稿 1");
    expect(b.draftName).toBe("草稿 2");
    expect(store.getState().activeDraftId).toBe(b.id);
    expect(store.getState().nextDraftNumber).toBe(3);
  });
});

// ============================================================================
// selectDraft / markDirty / markClean
// ============================================================================
describe("selectDraft / markDirty / markClean", () => {
  it("selectDraft 切换 active 并清除 dirty", async () => {
    const store = await importFreshStore();
    const a = store.getState().addDraft();
    const b = store.getState().addDraft();
    store.getState().markDirty();
    expect(store.getState().isDirty).toBe(true);

    store.getState().selectDraft(a.id);
    expect(store.getState().activeDraftId).toBe(a.id);
    expect(store.getState().isDirty).toBe(false);
    // b 未被删除
    expect(store.getState().drafts.some(d => d.id === b.id)).toBe(true);
  });

  it("markDirty/markClean 切换标记", async () => {
    const store = await importFreshStore();
    store.getState().markDirty();
    expect(store.getState().isDirty).toBe(true);
    store.getState().markClean();
    expect(store.getState().isDirty).toBe(false);
  });
});

// ============================================================================
// updateDraft
// ============================================================================
describe("updateDraft", () => {
  it("content 变化自动标记 dirty", async () => {
    const store = await importFreshStore();
    const d = store.getState().addDraft();
    store.getState().updateDraft(d.id, {
      content: { type: "doc", content: [{ type: "paragraph" }] }
    });
    expect(store.getState().isDirty).toBe(true);
  });

  it("非 content 变化不标记 dirty", async () => {
    const store = await importFreshStore();
    const d = store.getState().addDraft();
    store.getState().updateDraft(d.id, { draftName: "新名字" });
    expect(store.getState().isDirty).toBe(false);
    const updated = store.getState().drafts.find(x => x.id === d.id);
    expect(updated?.draftName).toBe("新名字");
  });

  it("updatedAt 被刷新", async () => {
    const store = await importFreshStore();
    const d = store.getState().addDraft();
    const oldAt = d.updatedAt;
    await new Promise(r => setTimeout(r, 2));
    store.getState().updateDraft(d.id, { draftName: "x" });
    const after = store.getState().drafts.find(x => x.id === d.id);
    expect(after!.updatedAt).toBeGreaterThanOrEqual(oldAt);
  });
});

// ============================================================================
// deleteDraft / restoreDraft
// ============================================================================
describe("deleteDraft / restoreDraft", () => {
  it("删除最后一个草稿 → activeDraftId = null", async () => {
    const store = await importFreshStore();
    const d = store.getState().addDraft();
    store.getState().deleteDraft(d.id);
    expect(store.getState().drafts).toHaveLength(0);
    expect(store.getState().activeDraftId).toBeNull();
  });

  it("删除非 active 草稿 → activeDraftId 不变", async () => {
    const store = await importFreshStore();
    const a = store.getState().addDraft();
    const b = store.getState().addDraft();
    store.getState().selectDraft(a.id);
    store.getState().deleteDraft(b.id);
    expect(store.getState().activeDraftId).toBe(a.id);
  });

  it("删除 active 草稿 → activeDraftId 切到剩余最后一个", async () => {
    const store = await importFreshStore();
    const a = store.getState().addDraft();
    const b = store.getState().addDraft();
    const c = store.getState().addDraft();
    // 此时 active 为 c
    store.getState().deleteDraft(c.id);
    expect(store.getState().activeDraftId).toBe(b.id);
    expect(store.getState().drafts.map(d => d.id)).toEqual([a.id, b.id]);
  });

  it("restoreDraft 还原最近删除的草稿", async () => {
    const store = await importFreshStore();
    const d = store.getState().addDraft({ draftName: "待删除" });
    store.getState().deleteDraft(d.id);
    store.getState().restoreDraft();
    expect(store.getState().drafts).toHaveLength(1);
    expect(store.getState().drafts[0].draftName).toBe("待删除");
    expect(store.getState().activeDraftId).toBe(d.id);
  });

  it("restoreDraft 无 cache 时 no-op", async () => {
    const store = await importFreshStore();
    store.getState().restoreDraft();
    expect(store.getState().drafts).toHaveLength(0);
  });
});

// ============================================================================
// duplicateDraft
// ============================================================================
describe("duplicateDraft", () => {
  it("复制草稿后缀带 (副本)", async () => {
    const store = await importFreshStore();
    const d = store.getState().addDraft({ draftName: "原稿" });
    const dup = store.getState().duplicateDraft(d.id);
    expect(dup).not.toBeNull();
    expect(dup!.draftName).toBe("原稿 (副本)");
    expect(dup!.id).not.toBe(d.id);
    expect(store.getState().drafts).toHaveLength(2);
    expect(store.getState().activeDraftId).toBe(dup!.id);
  });

  it("复制未知 id 返回 null", async () => {
    const store = await importFreshStore();
    const result = store.getState().duplicateDraft("nonexistent");
    expect(result).toBeNull();
  });

  it("复制清除 linkedChapterId 与 lastSyncedAt", async () => {
    const store = await importFreshStore();
    const d = store.getState().addDraft();
    store.getState().updateDraft(d.id, {
      linkedChapterId: "chapter-1",
      lastSyncedAt: 12345
    });
    const dup = store.getState().duplicateDraft(d.id);
    expect(dup!.linkedChapterId).toBeUndefined();
    expect(dup!.lastSyncedAt).toBeUndefined();
  });
});

// ============================================================================
// reorderDrafts
// ============================================================================
describe("reorderDrafts", () => {
  it("按 newOrder 重排 drafts", async () => {
    const store = await importFreshStore();
    const a = store.getState().addDraft();
    const b = store.getState().addDraft();
    const c = store.getState().addDraft();
    store.getState().reorderDrafts([c.id, a.id, b.id]);
    expect(store.getState().drafts.map(d => d.id)).toEqual([c.id, a.id, b.id]);
  });

  it("unknown id 被过滤", async () => {
    const store = await importFreshStore();
    const a = store.getState().addDraft();
    const b = store.getState().addDraft();
    store.getState().reorderDrafts([b.id, "unknown", a.id]);
    expect(store.getState().drafts.map(d => d.id)).toEqual([b.id, a.id]);
  });
});

// ============================================================================
// 查询 selectors
// ============================================================================
describe("selectors", () => {
  async function setupThreeDrafts() {
    const store = await importFreshStore();
    const guide1 = store.getState().addDraft({ draftName: "g1", linkedGuideId: "G1" });
    const unlinked = store.getState().addDraft({ draftName: "u" });
    const review = store.getState().addDraft({
      draftName: "r",
      draftType: "review",
      linkedAppId: "730",
      linkedAppName: "CS2"
    });
    store.getState().updateDraft(guide1.id, { linkedChapterId: "C1" });
    return { store, guide1, unlinked, review };
  }

  it("getDraftByChapterId 命中", async () => {
    const { store, guide1 } = await setupThreeDrafts();
    expect(store.getState().getDraftByChapterId("C1")?.id).toBe(guide1.id);
    expect(store.getState().getDraftByChapterId("none")).toBeUndefined();
  });

  it("getDraftsByArchive 按 guideId 过滤", async () => {
    const { store, guide1 } = await setupThreeDrafts();
    const list = store.getState().getDraftsByArchive("G1");
    expect(list.map(d => d.id)).toContain(guide1.id);
    expect(list).toHaveLength(1);
  });

  it("getDraftsByArchive(null) 返回无 guideId 绑定的草稿", async () => {
    const { store, unlinked, review } = await setupThreeDrafts();
    const list = store.getState().getDraftsByArchive(null);
    // review 没有 linkedGuideId，也会出现
    const ids = list.map(d => d.id);
    expect(ids).toContain(unlinked.id);
    expect(ids).toContain(review.id);
  });

  it("getUnlinkedDrafts 同 getDraftsByArchive(null)", async () => {
    const { store } = await setupThreeDrafts();
    expect(store.getState().getUnlinkedDrafts()).toHaveLength(2);
  });

  it("getDraftsByAppId 仅 review 且匹配 appId", async () => {
    const { store, review } = await setupThreeDrafts();
    const list = store.getState().getDraftsByAppId("730");
    expect(list.map(d => d.id)).toEqual([review.id]);
    expect(store.getState().getDraftsByAppId("999")).toHaveLength(0);
  });
});

// ============================================================================
// selectBestDraft
// ============================================================================
describe("selectBestDraft", () => {
  it("guide 模式 + archiveId → 选匹配最新 updatedAt 的草稿", async () => {
    const store = await importFreshStore();
    const a = store.getState().addDraft({ linkedGuideId: "G1" });
    // 人为拉开 updatedAt，避免同一 tick 下 Date.now() 相同导致 sort 不稳定
    await new Promise(r => setTimeout(r, 2));
    const b = store.getState().addDraft({ linkedGuideId: "G1" });
    store.getState().selectBestDraft("G1", false);
    expect(store.getState().activeDraftId).toBe(b.id);
    // a 仍存在
    expect(store.getState().drafts.some(d => d.id === a.id)).toBe(true);
  });

  it("guide 模式 + null archiveId → 选无 guideId 绑定的草稿", async () => {
    const store = await importFreshStore();
    store.getState().addDraft({ linkedGuideId: "G1" });
    const unlinked = store.getState().addDraft();
    store.getState().selectBestDraft(null, false);
    expect(store.getState().activeDraftId).toBe(unlinked.id);
  });

  it("review 模式 + appId → 只选匹配的 review 草稿", async () => {
    const store = await importFreshStore();
    store.getState().addDraft({ draftType: "review", linkedAppId: "1" });
    const target = store.getState().addDraft({ draftType: "review", linkedAppId: "2" });
    store.getState().selectBestDraft(null, true, "2");
    expect(store.getState().activeDraftId).toBe(target.id);
  });

  it("review 模式无 appId（offline） → 选任意 review", async () => {
    const store = await importFreshStore();
    store.getState().addDraft();
    const review = store.getState().addDraft({ draftType: "review" });
    store.getState().selectBestDraft(null, true);
    expect(store.getState().activeDraftId).toBe(review.id);
  });

  it("无匹配 → activeDraftId = null", async () => {
    const store = await importFreshStore();
    store.getState().addDraft({ linkedGuideId: "G1" });
    store.getState().selectBestDraft("G-NONE", false);
    expect(store.getState().activeDraftId).toBeNull();
  });
});

// ============================================================================
// sessionStorage 同步
// ============================================================================
describe("sessionStorage 同步 activeDraftId", () => {
  const TAB_KEY = "nasge-tab-activeDraft";

  it("切换 activeDraftId 时写入 sessionStorage", async () => {
    const store = await importFreshStore();
    const a = store.getState().addDraft();
    expect(sessionStorage.getItem(TAB_KEY)).toBe(a.id);
  });

  it("activeDraftId 置 null 时清除 sessionStorage", async () => {
    const store = await importFreshStore();
    const d = store.getState().addDraft();
    store.getState().deleteDraft(d.id);
    expect(sessionStorage.getItem(TAB_KEY)).toBeNull();
  });
});

// ============================================================================
// persist / rehydrate
// ============================================================================
describe("persist / rehydrate", () => {
  const STORE_KEY = "nasge-drafts";
  const TAB_KEY = "nasge-tab-activeDraft";

  function writePersisted(drafts: Draft[], nextDraftNumber: number, version = 2) {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        state: { drafts, nextDraftNumber },
        version
      })
    );
  }

  function sampleDraft(id: string, overrides: Partial<Draft> = {}): Draft {
    return {
      id,
      draftName: `d-${id}`,
      title: { type: "doc", content: [{ type: "paragraph", content: [] }] },
      content: { type: "doc", content: [] },
      updatedAt: Date.now(),
      draftType: "guide",
      ...overrides
    };
  }

  it("rehydrate 后 drafts 从 localStorage 恢复", async () => {
    writePersisted([sampleDraft("a"), sampleDraft("b")], 3);
    const store = await importFreshStore();
    expect(store.getState().drafts.map(d => d.id)).toEqual(["a", "b"]);
    expect(store.getState().nextDraftNumber).toBe(3);
  });

  it("sessionStorage 有效 activeDraftId → rehydrate 恢复", async () => {
    writePersisted([sampleDraft("a"), sampleDraft("b")], 3);
    sessionStorage.setItem(TAB_KEY, "b");
    const store = await importFreshStore();
    expect(store.getState().activeDraftId).toBe("b");
  });

  it("sessionStorage 无效 → fallback 到第一个草稿", async () => {
    writePersisted([sampleDraft("a"), sampleDraft("b")], 3);
    sessionStorage.setItem(TAB_KEY, "not-exist");
    const store = await importFreshStore();
    expect(store.getState().activeDraftId).toBe("a");
  });

  it("sessionStorage 无记录 → fallback 到第一个草稿", async () => {
    writePersisted([sampleDraft("a")], 2);
    const store = await importFreshStore();
    expect(store.getState().activeDraftId).toBe("a");
  });

  it("空 drafts 列表 → activeDraftId 保持 null", async () => {
    writePersisted([], 1);
    const store = await importFreshStore();
    expect(store.getState().activeDraftId).toBeNull();
  });

  it("v0 → v1 migrate 自动补 nextDraftNumber", async () => {
    // 老版本没有 nextDraftNumber，version=0
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        state: { drafts: [sampleDraft("a"), sampleDraft("b")] },
        version: 0
      })
    );
    const store = await importFreshStore();
    // migrate 应填充 nextDraftNumber = drafts.length + 1
    expect(store.getState().nextDraftNumber).toBe(3);
  });

  it("partialize 不持久化 activeDraftId（只存 drafts + nextDraftNumber）", async () => {
    // debounced 默认 500ms，用 fake timer 推进
    vi.useFakeTimers();
    try {
      const store = await importFreshStore();
      store.getState().addDraft();
      vi.advanceTimersByTime(600);
      const raw = localStorage.getItem(STORE_KEY);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      expect(parsed.state).toHaveProperty("drafts");
      expect(parsed.state).toHaveProperty("nextDraftNumber");
      expect(parsed.state).not.toHaveProperty("activeDraftId");
      expect(parsed.state).not.toHaveProperty("isDirty");
    } finally {
      vi.useRealTimers();
    }
  });
});
