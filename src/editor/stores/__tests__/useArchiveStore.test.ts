/**
 * useArchiveStore 测试
 *
 * 覆盖：
 * - 存档 CRUD (createArchive / updateArchive / deleteArchive / getArchive)
 * - saveChaptersToArchive
 * - 标签 CRUD + 打标签 + 查询
 * - v0 → v1 migrate（老数据无 imageTags/imageTagMap 字段）
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { useArchiveStore as UseArchiveStoreType, GuideArchive, ChapterInfo } from "../useArchiveStore";

type Store = typeof UseArchiveStoreType;

async function importFreshStore(): Promise<Store> {
  vi.resetModules();
  const mod = await import("../useArchiveStore");
  await Promise.resolve();
  return mod.useArchiveStore;
}

function sampleChapters(): ChapterInfo[] {
  return [
    { sectionId: "s1", title: "章节 1", order: 0 },
    { sectionId: "s2", title: "章节 2", order: 1 }
  ];
}

beforeEach(() => {
  vi.useRealTimers();
});

// ============================================================================
// 存档 CRUD
// ============================================================================
describe("存档 CRUD", () => {
  it("createArchive 初始化默认字段", async () => {
    const store = await importFreshStore();
    const archive = store.getState().createArchive("G1", {
      title: "标题",
      coverUrl: "https://ex.com/c.jpg",
      chapters: sampleChapters()
    });
    expect(archive.guideId).toBe("G1");
    expect(archive.guideName).toBe("标题");
    expect(archive.coverUrl).toBe("https://ex.com/c.jpg");
    expect(archive.chapters).toHaveLength(2);
    expect(archive.imageTags).toEqual([]);
    expect(archive.imageTagMap).toEqual({});
    expect(archive.createdAt).toBeGreaterThan(0);
    expect(archive.lastAccessedAt).toBeGreaterThan(0);
    expect(store.getState().archives["G1"]).toBe(archive);
  });

  it("updateArchive 合并 patch", async () => {
    const store = await importFreshStore();
    store.getState().createArchive("G1", { title: "旧", chapters: [] });
    store.getState().updateArchive("G1", { guideName: "新", coverUrl: "https://x/y.jpg" });
    const a = store.getState().getArchive("G1");
    expect(a?.guideName).toBe("新");
    expect(a?.coverUrl).toBe("https://x/y.jpg");
  });

  it("updateArchive 对未知 id 无副作用", async () => {
    const store = await importFreshStore();
    store.getState().updateArchive("nonexistent", { guideName: "x" });
    expect(store.getState().archives).toEqual({});
  });

  it("deleteArchive 移除", async () => {
    const store = await importFreshStore();
    store.getState().createArchive("G1", { title: "t", chapters: [] });
    store.getState().createArchive("G2", { title: "t", chapters: [] });
    store.getState().deleteArchive("G1");
    expect(store.getState().getArchive("G1")).toBeUndefined();
    expect(store.getState().getArchive("G2")).toBeDefined();
  });

  it("getArchive 未知 id 返回 undefined", async () => {
    const store = await importFreshStore();
    expect(store.getState().getArchive("none")).toBeUndefined();
  });

  it("saveChaptersToArchive 更新 chapters + chaptersUpdatedAt", async () => {
    const store = await importFreshStore();
    store.getState().createArchive("G1", { title: "t", chapters: sampleChapters() });
    const before = store.getState().getArchive("G1")!.chaptersUpdatedAt;
    await new Promise(r => setTimeout(r, 2));
    const next: ChapterInfo[] = [{ sectionId: "s3", title: "新章节", order: 0 }];
    store.getState().saveChaptersToArchive("G1", next);
    const a = store.getState().getArchive("G1")!;
    expect(a.chapters).toEqual(next);
    expect(a.chaptersUpdatedAt).toBeGreaterThanOrEqual(before);
  });

  it("saveChaptersToArchive 对未知 id 无副作用", async () => {
    const store = await importFreshStore();
    store.getState().saveChaptersToArchive("nope", []);
    expect(store.getState().archives).toEqual({});
  });
});

// ============================================================================
// 标签 CRUD
// ============================================================================
describe("标签 CRUD", () => {
  it("createTag 自动分配颜色与 order", async () => {
    const store = await importFreshStore();
    store.getState().createArchive("G1", { title: "t", chapters: [] });
    const tag1 = store.getState().createTag("G1", "红色");
    const tag2 = store.getState().createTag("G1", "橙色");
    expect(tag1?.order).toBe(0);
    expect(tag2?.order).toBe(1);
    // 不同颜色
    expect(tag1?.color).not.toBe(tag2?.color);
  });

  it("createTag 未知 archive 返 null", async () => {
    const store = await importFreshStore();
    expect(store.getState().createTag("nope", "t")).toBeNull();
  });

  it("createTag 显式指定颜色被尊重", async () => {
    const store = await importFreshStore();
    store.getState().createArchive("G1", { title: "t", chapters: [] });
    const tag = store.getState().createTag("G1", "custom", "#123456");
    expect(tag?.color).toBe("#123456");
  });

  it("createTag 颜色耗尽时 round-robin", async () => {
    const store = await importFreshStore();
    store.getState().createArchive("G1", { title: "t", chapters: [] });
    // TAG_COLORS 9 个，创建 10 个标签触发 round-robin
    for (let i = 0; i < 10; i++) {
      store.getState().createTag("G1", `t${i}`);
    }
    const archive = store.getState().getArchive("G1")!;
    expect(archive.imageTags).toHaveLength(10);
    // 第 10 个复用第 1 个颜色
    expect(archive.imageTags[9].color).toBe(archive.imageTags[0].color);
  });

  it("updateTag 改名", async () => {
    const store = await importFreshStore();
    store.getState().createArchive("G1", { title: "t", chapters: [] });
    const t = store.getState().createTag("G1", "旧")!;
    store.getState().updateTag("G1", t.id, { name: "新" });
    expect(store.getState().getArchive("G1")!.imageTags[0].name).toBe("新");
  });

  it("updateTag 未知 archive 无副作用", async () => {
    const store = await importFreshStore();
    store.getState().updateTag("nope", "t", { name: "x" });
    expect(store.getState().archives).toEqual({});
  });

  it("deleteTag 同时清理 imageTagMap", async () => {
    const store = await importFreshStore();
    store.getState().createArchive("G1", { title: "t", chapters: [] });
    const t1 = store.getState().createTag("G1", "t1")!;
    const t2 = store.getState().createTag("G1", "t2")!;
    store.getState().addTagToImage("G1", "img1", t1.id);
    store.getState().addTagToImage("G1", "img1", t2.id);
    store.getState().deleteTag("G1", t1.id);

    const archive = store.getState().getArchive("G1")!;
    expect(archive.imageTags.map(t => t.id)).toEqual([t2.id]);
    expect(archive.imageTagMap["img1"]).toEqual([t2.id]);
  });

  it("deleteTag 清理后 imageTagMap 空 entry 被移除", async () => {
    const store = await importFreshStore();
    store.getState().createArchive("G1", { title: "t", chapters: [] });
    const t = store.getState().createTag("G1", "only")!;
    store.getState().addTagToImage("G1", "img1", t.id);
    store.getState().deleteTag("G1", t.id);
    expect(store.getState().getArchive("G1")!.imageTagMap).toEqual({});
  });

  it("reorderTags 按新顺序并重置 order index", async () => {
    const store = await importFreshStore();
    store.getState().createArchive("G1", { title: "t", chapters: [] });
    const a = store.getState().createTag("G1", "a")!;
    const b = store.getState().createTag("G1", "b")!;
    const c = store.getState().createTag("G1", "c")!;
    store.getState().reorderTags("G1", [c.id, a.id, b.id]);
    const tags = store.getState().getArchive("G1")!.imageTags;
    expect(tags.map(t => t.id)).toEqual([c.id, a.id, b.id]);
    expect(tags.map(t => t.order)).toEqual([0, 1, 2]);
  });
});

// ============================================================================
// 图片打标签
// ============================================================================
describe("图片打标签", () => {
  async function setup() {
    const store = await importFreshStore();
    store.getState().createArchive("G1", { title: "t", chapters: [] });
    const t1 = store.getState().createTag("G1", "t1")!;
    const t2 = store.getState().createTag("G1", "t2")!;
    return { store, t1, t2 };
  }

  it("addTagToImage 添加", async () => {
    const { store, t1 } = await setup();
    store.getState().addTagToImage("G1", "img1", t1.id);
    expect(store.getState().getArchive("G1")!.imageTagMap["img1"]).toEqual([t1.id]);
  });

  it("addTagToImage 去重", async () => {
    const { store, t1 } = await setup();
    store.getState().addTagToImage("G1", "img1", t1.id);
    store.getState().addTagToImage("G1", "img1", t1.id);
    expect(store.getState().getArchive("G1")!.imageTagMap["img1"]).toEqual([t1.id]);
  });

  it("addTagToImage 忽略未知 tagId", async () => {
    const { store } = await setup();
    store.getState().addTagToImage("G1", "img1", "ghost");
    expect(store.getState().getArchive("G1")!.imageTagMap).toEqual({});
  });

  it("addTagToImage 未知 archive 无副作用", async () => {
    const store = await importFreshStore();
    store.getState().addTagToImage("nope", "img", "t");
    expect(store.getState().archives).toEqual({});
  });

  it("removeTagFromImage 清理 + 移除空 entry", async () => {
    const { store, t1 } = await setup();
    store.getState().addTagToImage("G1", "img1", t1.id);
    store.getState().removeTagFromImage("G1", "img1", t1.id);
    expect(store.getState().getArchive("G1")!.imageTagMap).toEqual({});
  });

  it("removeTagFromImage 保留其他 tag", async () => {
    const { store, t1, t2 } = await setup();
    store.getState().addTagToImage("G1", "img1", t1.id);
    store.getState().addTagToImage("G1", "img1", t2.id);
    store.getState().removeTagFromImage("G1", "img1", t1.id);
    expect(store.getState().getArchive("G1")!.imageTagMap["img1"]).toEqual([t2.id]);
  });

  it("setImageTags 过滤非法 tagIds", async () => {
    const { store, t1 } = await setup();
    store.getState().setImageTags("G1", "img1", [t1.id, "ghost"]);
    expect(store.getState().getArchive("G1")!.imageTagMap["img1"]).toEqual([t1.id]);
  });

  it("setImageTags 空数组移除 entry", async () => {
    const { store, t1 } = await setup();
    store.getState().addTagToImage("G1", "img1", t1.id);
    store.getState().setImageTags("G1", "img1", []);
    expect(store.getState().getArchive("G1")!.imageTagMap).toEqual({});
  });
});

// ============================================================================
// 标签查询
// ============================================================================
describe("标签查询", () => {
  it("getTagsForImage 按 order 排序", async () => {
    const store = await importFreshStore();
    store.getState().createArchive("G1", { title: "t", chapters: [] });
    const a = store.getState().createTag("G1", "a")!;
    const b = store.getState().createTag("G1", "b")!;
    // 反序添加
    store.getState().addTagToImage("G1", "img1", b.id);
    store.getState().addTagToImage("G1", "img1", a.id);
    const result = store.getState().getTagsForImage("G1", "img1");
    expect(result.map(t => t.id)).toEqual([a.id, b.id]);
  });

  it("getTagsForImage 未知 archive 返空数组", async () => {
    const store = await importFreshStore();
    expect(store.getState().getTagsForImage("nope", "img")).toEqual([]);
  });

  it("getImageIdsByTag", async () => {
    const store = await importFreshStore();
    store.getState().createArchive("G1", { title: "t", chapters: [] });
    const t1 = store.getState().createTag("G1", "t1")!;
    store.getState().addTagToImage("G1", "a", t1.id);
    store.getState().addTagToImage("G1", "b", t1.id);
    expect(store.getState().getImageIdsByTag("G1", t1.id).sort()).toEqual(["a", "b"]);
  });

  it("getImageIdsByTag 未知 archive 返空", async () => {
    const store = await importFreshStore();
    expect(store.getState().getImageIdsByTag("nope", "t")).toEqual([]);
  });

  it("getUntaggedImageIds 从 cachedImages 过滤", async () => {
    const store = await importFreshStore();
    store.getState().createArchive("G1", { title: "t", chapters: [] });
    const t1 = store.getState().createTag("G1", "t1")!;
    store.getState().updateArchive("G1", {
      cachedImages: [
        { previewId: "a", fileName: "a.jpg" },
        { previewId: "b", fileName: "b.jpg" },
        { previewId: "c", fileName: "c.jpg" }
      ]
    });
    store.getState().addTagToImage("G1", "a", t1.id);
    expect(store.getState().getUntaggedImageIds("G1").sort()).toEqual(["b", "c"]);
  });

  it("getUntaggedImageIds 未知 archive 返空", async () => {
    const store = await importFreshStore();
    expect(store.getState().getUntaggedImageIds("nope")).toEqual([]);
  });
});

// ============================================================================
// persist / migrate
// ============================================================================
describe("persist / migrate", () => {
  const STORE_KEY = "nasge-archives";

  it("v0 数据缺 imageTags/imageTagMap → migrate 自动补", async () => {
    // 模拟老版本数据：没有 imageTags/imageTagMap
    const partialArchive = {
      guideId: "G1",
      guideName: "旧指南",
      chapters: sampleChapters(),
      chaptersUpdatedAt: 100,
      createdAt: 100,
      lastAccessedAt: 100
      // 故意缺 imageTags 和 imageTagMap
    } as unknown as GuideArchive;

    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        state: { archives: { G1: partialArchive } },
        version: 0
      })
    );

    const store = await importFreshStore();
    const migrated = store.getState().getArchive("G1");
    expect(migrated).toBeDefined();
    expect(migrated!.imageTags).toEqual([]);
    expect(migrated!.imageTagMap).toEqual({});
  });

  it("空 persisted state → migrate 返回空 archives", async () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ state: null, version: 0 }));
    const store = await importFreshStore();
    expect(store.getState().archives).toEqual({});
  });

  it("partialize 只持久化 archives", async () => {
    const store = await importFreshStore();
    store.getState().createArchive("G1", { title: "t", chapters: [] });
    const raw = localStorage.getItem(STORE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(Object.keys(parsed.state)).toEqual(["archives"]);
  });
});
