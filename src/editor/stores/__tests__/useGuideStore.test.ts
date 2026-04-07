/**
 * useGuideStore 测试
 *
 * 该 store 是"会话层"，与 useDraftStore / useArchiveStore / useReviewStore /
 * useSteamGuideImageStore 存在跨 store 协调。测试策略：
 *
 * - 用 vi.resetModules() + 动态 import 保证每次测试所有 store 一起重置
 * - 不 mock 其他 store，直接观察副作用（archive 被创建、draft 被切换等）
 * - loadFromArchive 在测试环境下不会触发网络调用（archive 无 cachedImages 时仅
 *   在内存中切换 status）
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { useGuideStore as UseGuideStoreType, GuideInfo, EditorMode } from "../useGuideStore";
import type { useArchiveStore as UseArchiveStoreType } from "../useArchiveStore";
import type { useDraftStore as UseDraftStoreType } from "../useDraftStore";
import type { useReviewStore as UseReviewStoreType } from "../useReviewStore";

type GuideStore = typeof UseGuideStoreType;
type ArchiveStore = typeof UseArchiveStoreType;
type DraftStore = typeof UseDraftStoreType;
type ReviewStore = typeof UseReviewStoreType;

interface Stores {
  guide: GuideStore;
  archive: ArchiveStore;
  draft: DraftStore;
  review: ReviewStore;
}

async function importFreshStores(): Promise<Stores> {
  vi.resetModules();
  // 顺序 import，避免 Promise.all 与循环依赖 (useGuideStore ↔
  // useSteamGuideImageStore) 交互时的解析死锁
  const guideMod = await import("../useGuideStore");
  const archiveMod = await import("../useArchiveStore");
  const draftMod = await import("../useDraftStore");
  const reviewMod = await import("../useReviewStore");
  // 等 onRehydrateStorage 的 queueMicrotask
  await Promise.resolve();
  await Promise.resolve();
  return {
    guide: guideMod.useGuideStore,
    archive: archiveMod.useArchiveStore,
    draft: draftMod.useDraftStore,
    review: reviewMod.useReviewStore
  };
}

function sampleGuideInfo(id = "G1"): GuideInfo {
  return {
    id,
    title: "测试指南",
    coverUrl: "https://ex.com/cover.jpg",
    chapters: [
      { sectionId: "s1", title: "章节 1", order: 0 },
      { sectionId: "s2", title: "章节 2", order: 1 }
    ]
  };
}

beforeEach(() => {
  vi.useRealTimers();
});

// ============================================================================
// 模式辅助函数
// ============================================================================
describe("isReviewMode / isGuideMode / isOnlineMode", () => {
  it("分类 4 种 EditorMode", async () => {
    const mod = await import("../useGuideStore");
    const { isReviewMode, isGuideMode, isOnlineMode } = mod;
    const cases: [EditorMode, boolean, boolean, boolean][] = [
      // [mode, review, guide, online]
      ["guide", false, true, true],
      ["review", true, false, true],
      ["offline-guide", false, true, false],
      ["offline-review", true, false, false]
    ];
    for (const [mode, review, guide, online] of cases) {
      expect(isReviewMode(mode)).toBe(review);
      expect(isGuideMode(mode)).toBe(guide);
      expect(isOnlineMode(mode)).toBe(online);
    }
  });
});

// ============================================================================
// 初始状态
// ============================================================================
describe("初始状态", () => {
  it("默认 offline-guide 模式，其余空", async () => {
    const { guide } = await importFreshStores();
    expect(guide.getState().mode).toBe("offline-guide");
    expect(guide.getState().guideInfo).toBeNull();
    expect(guide.getState().currentArchiveId).toBeNull();
    expect(guide.getState().currentChapterId).toBeNull();
  });
});

// ============================================================================
// setMode
// ============================================================================
describe("setMode", () => {
  it("切到 guide 模式保留现有 archive 与 guideInfo", async () => {
    const { guide } = await importFreshStores();
    guide.getState().setGuideInfo(sampleGuideInfo("G1"));
    guide.getState().setMode("guide");
    expect(guide.getState().mode).toBe("guide");
    expect(guide.getState().currentArchiveId).toBe("G1");
  });

  it("切到 review 模式清空 archive/guideInfo/chapter", async () => {
    const { guide } = await importFreshStores();
    guide.getState().setGuideInfo(sampleGuideInfo("G1"));
    guide.getState().setCurrentChapter("s1");
    guide.getState().setMode("review");
    expect(guide.getState().mode).toBe("review");
    expect(guide.getState().currentArchiveId).toBeNull();
    expect(guide.getState().guideInfo).toBeNull();
    expect(guide.getState().currentChapterId).toBeNull();
  });

  it("切到 offline-review 清连接信息 + 清 guide", async () => {
    const { guide, review } = await importFreshStores();
    review.setState({ appId: "730", gameName: "CS2" });
    guide.getState().setGuideInfo(sampleGuideInfo("G1"));
    guide.getState().setMode("offline-review");
    expect(guide.getState().mode).toBe("offline-review");
    expect(review.getState().appId).toBeNull();
  });

  it("offline-guide 无 archive → 清 guideInfo/chapter", async () => {
    const { guide } = await importFreshStores();
    guide.getState().setMode("offline-guide");
    expect(guide.getState().mode).toBe("offline-guide");
    expect(guide.getState().guideInfo).toBeNull();
    expect(guide.getState().currentChapterId).toBeNull();
  });

  it("切 guide 模式后 draft store 被触发 selectBestDraft", async () => {
    const { guide, draft } = await importFreshStores();
    // 创建一个 guide 草稿
    const d = draft.getState().addDraft({ linkedGuideId: "G1" });
    guide.getState().setGuideInfo(sampleGuideInfo("G1"));
    // 此时已通过 setGuideInfo 触发过 selectBestDraft
    expect(draft.getState().activeDraftId).toBe(d.id);
  });

  it("切 review 模式后 draft store 被触发 selectBestDraft(review)", async () => {
    const { guide, draft, review } = await importFreshStores();
    draft.getState().addDraft(); // guide 草稿
    const reviewDraft = draft.getState().addDraft({ draftType: "review" });
    review.setState({ appId: null });
    guide.getState().setMode("offline-review");
    expect(draft.getState().activeDraftId).toBe(reviewDraft.id);
  });
});

// ============================================================================
// setGuideInfo
// ============================================================================
describe("setGuideInfo", () => {
  it("info.id 存在 → 创建 archive + 切 guide 模式", async () => {
    const { guide, archive } = await importFreshStores();
    const info = sampleGuideInfo("G1");
    guide.getState().setGuideInfo(info);

    expect(guide.getState().guideInfo).toEqual(info);
    expect(guide.getState().mode).toBe("guide");
    expect(guide.getState().currentArchiveId).toBe("G1");

    const a = archive.getState().getArchive("G1");
    expect(a).toBeDefined();
    expect(a!.guideName).toBe("测试指南");
    expect(a!.chapters).toHaveLength(2);
  });

  it("existing archive → 更新而非重建", async () => {
    const { guide, archive } = await importFreshStores();
    // 先手动创建 archive 并添加一个 tag
    archive.getState().createArchive("G1", { title: "旧", chapters: [] });
    const tag = archive.getState().createTag("G1", "keep")!;

    guide.getState().setGuideInfo(sampleGuideInfo("G1"));
    const updated = archive.getState().getArchive("G1")!;
    expect(updated.guideName).toBe("测试指南"); // 已更新
    // tag 被保留（说明是 update 而不是 create 覆盖）
    expect(updated.imageTags.some(t => t.id === tag.id)).toBe(true);
  });

  it("info.id 为空 → 仅设置 guideInfo + 切 guide 模式，不写 archive", async () => {
    const { guide, archive } = await importFreshStores();
    const info: GuideInfo = { id: "", title: "无 id", chapters: [] };
    guide.getState().setGuideInfo(info);
    expect(guide.getState().guideInfo).toEqual(info);
    expect(guide.getState().mode).toBe("guide");
    expect(Object.keys(archive.getState().archives)).toHaveLength(0);
  });

  it("setGuideInfo 触发 selectBestDraft 选择匹配 archive 的草稿", async () => {
    const { guide, draft } = await importFreshStores();
    const target = draft.getState().addDraft({ linkedGuideId: "G1" });
    // 另建一个无关草稿
    draft.getState().addDraft({ linkedGuideId: "G-OTHER" });
    guide.getState().setGuideInfo(sampleGuideInfo("G1"));
    expect(draft.getState().activeDraftId).toBe(target.id);
  });
});

// ============================================================================
// clearGuideInfo
// ============================================================================
describe("clearGuideInfo", () => {
  it("清 guideInfo 和 currentChapterId，保留 archive/mode", async () => {
    const { guide } = await importFreshStores();
    guide.getState().setGuideInfo(sampleGuideInfo("G1"));
    guide.getState().setCurrentChapter("s1");
    guide.getState().clearGuideInfo();
    expect(guide.getState().guideInfo).toBeNull();
    expect(guide.getState().currentChapterId).toBeNull();
    // currentArchiveId 不被清
    expect(guide.getState().currentArchiveId).toBe("G1");
  });
});

// ============================================================================
// switchArchive
// ============================================================================
describe("switchArchive", () => {
  it("切换到已有 archive", async () => {
    const { guide, archive } = await importFreshStores();
    archive.getState().createArchive("G1", {
      title: "a1",
      chapters: [{ sectionId: "s1", title: "c1", order: 0 }]
    });
    archive.getState().createArchive("G2", {
      title: "a2",
      chapters: [{ sectionId: "s2", title: "c2", order: 0 }]
    });

    guide.getState().switchArchive("G2");
    expect(guide.getState().currentArchiveId).toBe("G2");
    expect(guide.getState().guideInfo?.id).toBe("G2");
    expect(guide.getState().guideInfo?.title).toBe("a2");
  });

  it("切到 null → offline-guide 模式 + 清 archive/guideInfo", async () => {
    const { guide, archive } = await importFreshStores();
    archive.getState().createArchive("G1", { title: "t", chapters: [] });
    guide.getState().switchArchive("G1");
    guide.getState().switchArchive(null);
    expect(guide.getState().currentArchiveId).toBeNull();
    expect(guide.getState().guideInfo).toBeNull();
    expect(guide.getState().mode).toBe("offline-guide");
  });

  it("切到不存在的 archive → 保持原状并警告", async () => {
    const { guide, archive } = await importFreshStores();
    archive.getState().createArchive("G1", { title: "t", chapters: [] });
    guide.getState().switchArchive("G1");
    const beforeId = guide.getState().currentArchiveId;
    guide.getState().switchArchive("GHOST");
    expect(guide.getState().currentArchiveId).toBe(beforeId);
  });

  it("从 offline-guide 切 archive 模式仍为 offline-guide", async () => {
    const { guide, archive } = await importFreshStores();
    archive.getState().createArchive("G1", { title: "t", chapters: [] });
    // 当前为默认 offline-guide
    guide.getState().switchArchive("G1");
    expect(guide.getState().mode).toBe("offline-guide");
  });

  it("从 guide 模式切 archive 模式仍为 guide", async () => {
    const { guide, archive } = await importFreshStores();
    archive.getState().createArchive("G1", { title: "t", chapters: [] });
    archive.getState().createArchive("G2", { title: "t2", chapters: [] });
    guide.getState().setMode("guide");
    guide.getState().switchArchive("G1");
    guide.getState().switchArchive("G2");
    expect(guide.getState().mode).toBe("guide");
  });
});

// ============================================================================
// setCurrentChapter
// ============================================================================
describe("setCurrentChapter", () => {
  it("直接更新", async () => {
    const { guide } = await importFreshStores();
    guide.getState().setCurrentChapter("s1");
    expect(guide.getState().currentChapterId).toBe("s1");
    guide.getState().setCurrentChapter(null);
    expect(guide.getState().currentChapterId).toBeNull();
  });
});

// ============================================================================
// reorderChapters
// ============================================================================
describe("reorderChapters", () => {
  it("按新顺序重排并重置 order index", async () => {
    const { guide } = await importFreshStores();
    guide.getState().setGuideInfo({
      id: "G1",
      title: "t",
      chapters: [
        { sectionId: "a", title: "A", order: 0 },
        { sectionId: "b", title: "B", order: 1 },
        { sectionId: "c", title: "C", order: 2 }
      ]
    });
    guide.getState().reorderChapters(["c", "a", "b"]);
    const chapters = guide.getState().guideInfo!.chapters;
    expect(chapters.map(c => c.sectionId)).toEqual(["c", "a", "b"]);
    expect(chapters.map(c => c.order)).toEqual([0, 1, 2]);
  });

  it("unknown sectionId 被过滤", async () => {
    const { guide } = await importFreshStores();
    guide.getState().setGuideInfo({
      id: "G1",
      title: "t",
      chapters: [
        { sectionId: "a", title: "A", order: 0 },
        { sectionId: "b", title: "B", order: 1 }
      ]
    });
    guide.getState().reorderChapters(["b", "ghost", "a"]);
    const chapters = guide.getState().guideInfo!.chapters;
    expect(chapters.map(c => c.sectionId)).toEqual(["b", "a"]);
  });

  it("guideInfo 为 null → 无副作用", async () => {
    const { guide } = await importFreshStores();
    guide.getState().reorderChapters(["x"]);
    expect(guide.getState().guideInfo).toBeNull();
  });
});

// ============================================================================
// persist (sessionStorage)
// ============================================================================
describe("persist / rehydrate", () => {
  const STORE_KEY = "nasge-session";

  it("partialize 持久化 mode/guideInfo/archiveId/chapterId", async () => {
    const { guide } = await importFreshStores();
    guide.getState().setGuideInfo(sampleGuideInfo("G1"));
    guide.getState().setCurrentChapter("s1");

    const raw = sessionStorage.getItem(STORE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.state).toHaveProperty("mode");
    expect(parsed.state).toHaveProperty("guideInfo");
    expect(parsed.state).toHaveProperty("currentArchiveId");
    expect(parsed.state).toHaveProperty("currentChapterId");
  });

  it("rehydrate 从 sessionStorage 恢复", async () => {
    sessionStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        state: {
          mode: "guide",
          guideInfo: sampleGuideInfo("G7"),
          currentArchiveId: "G7",
          currentChapterId: "s1"
        },
        version: 1
      })
    );
    const { guide } = await importFreshStores();
    expect(guide.getState().mode).toBe("guide");
    expect(guide.getState().currentArchiveId).toBe("G7");
    expect(guide.getState().currentChapterId).toBe("s1");
  });
});
