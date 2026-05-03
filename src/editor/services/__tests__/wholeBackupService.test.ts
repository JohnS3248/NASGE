/**
 * wholeBackupService 单元测试 — IndexedDB CRUD
 *
 * 用 fake-indexeddb 打桩 indexedDB / IDBKeyRange，覆盖：
 *   - saveManualArchive 写入与返回 archiveId
 *   - listArchives 按 guideId 过滤 + 按 createdAt 倒序
 *   - loadFullArchive 取得完整 record
 *   - renameArchive 修改 label
 *   - deleteArchive 删除后不再可见
 *   - 跨 guide 隔离
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import type { JSONContent } from "@tiptap/core";
import type { WholeGuideChapterMeta } from "../../stores/useWholeGuideStore";

vi.mock("../../../shared/logger", () => ({
  loggers: {
    store: { info: () => {}, warn: () => {}, verbose: () => {}, error: () => {} },
    editor: { info: () => {}, warn: () => {}, verbose: () => {}, error: () => {} },
    sync: { info: () => {}, warn: () => {}, verbose: () => {}, error: () => {} },
    persist: { info: () => {}, warn: () => {}, verbose: () => {}, error: () => {} },
    image: { info: () => {}, warn: () => {}, verbose: () => {}, error: () => {} },
    bridge: { info: () => {}, warn: () => {}, verbose: () => {}, error: () => {} },
    config: { info: () => {}, warn: () => {}, verbose: () => {}, error: () => {} },
    popup: { info: () => {}, warn: () => {}, verbose: () => {}, error: () => {} },
  },
}));

beforeEach(async () => {
  // 每个 case 前重置 IDB（重新引入 fake-indexeddb 模块来重置状态）
  const { IDBFactory } = await import("fake-indexeddb");
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  // 同时重置 service 内部的 dbPromise 缓存
  vi.resetModules();
});

const sampleDoc: JSONContent = {
  type: "doc",
  content: [
    { type: "chapterTitle", content: [{ type: "text", text: "Test" }] },
    { type: "paragraph", content: [{ type: "text", text: "body" }] },
  ],
};

const sampleChapters: WholeGuideChapterMeta[] = [
  { sectionId: "a", title: "A", bbcode: "a body", contentHash: "h1", order: 0 },
  { sectionId: "b", title: "B", bbcode: "b body", contentHash: "h2", order: 1 },
];

async function loadService() {
  return await import("../wholeBackupService");
}

describe("wholeBackupService — saveManualArchive + listArchives", () => {
  it("saveManualArchive 返回非空 archiveId", async () => {
    const svc = await loadService();
    const id = await svc.saveManualArchive({
      guideId: "g1",
      label: "first",
      doc: sampleDoc,
      chapters: sampleChapters,
    });
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("listArchives 取出已保存的存档", async () => {
    const svc = await loadService();
    await svc.saveManualArchive({
      guideId: "g1",
      label: "v1",
      doc: sampleDoc,
      chapters: sampleChapters,
    });
    const list = await svc.listArchives("g1");
    expect(list).toHaveLength(1);
    expect(list[0].label).toBe("v1");
    expect(list[0].guideId).toBe("g1");
    expect(list[0].chapterCount).toBe(2);
  });

  it("listArchives 按 createdAt 倒序", async () => {
    const svc = await loadService();
    await svc.saveManualArchive({
      guideId: "g1",
      label: "first",
      doc: sampleDoc,
      chapters: sampleChapters,
    });
    await new Promise((r) => setTimeout(r, 5));
    await svc.saveManualArchive({
      guideId: "g1",
      label: "second",
      doc: sampleDoc,
      chapters: sampleChapters,
    });
    const list = await svc.listArchives("g1");
    expect(list).toHaveLength(2);
    expect(list[0].label).toBe("second");
    expect(list[1].label).toBe("first");
  });

  it("不同 guideId 的存档互不干扰", async () => {
    const svc = await loadService();
    await svc.saveManualArchive({
      guideId: "g1",
      label: "g1-archive",
      doc: sampleDoc,
      chapters: sampleChapters,
    });
    await svc.saveManualArchive({
      guideId: "g2",
      label: "g2-archive",
      doc: sampleDoc,
      chapters: sampleChapters,
    });
    const list1 = await svc.listArchives("g1");
    const list2 = await svc.listArchives("g2");
    expect(list1).toHaveLength(1);
    expect(list1[0].label).toBe("g1-archive");
    expect(list2).toHaveLength(1);
    expect(list2[0].label).toBe("g2-archive");
  });

  it("listArchives 对未存档的 guideId 返回空数组", async () => {
    const svc = await loadService();
    const list = await svc.listArchives("nonexistent");
    expect(list).toEqual([]);
  });

  it("sizeBytes 大致为 doc 序列化长度", async () => {
    const svc = await loadService();
    await svc.saveManualArchive({
      guideId: "g1",
      label: "x",
      doc: sampleDoc,
      chapters: sampleChapters,
    });
    const list = await svc.listArchives("g1");
    const expected = JSON.stringify(sampleDoc).length;
    expect(list[0].sizeBytes).toBe(expected);
  });
});

describe("wholeBackupService — loadFullArchive", () => {
  it("取得完整 doc + chapters", async () => {
    const svc = await loadService();
    const id = await svc.saveManualArchive({
      guideId: "g1",
      label: "x",
      doc: sampleDoc,
      chapters: sampleChapters,
    });
    const record = await svc.loadFullArchive(id);
    expect(record.archiveId).toBe(id);
    expect(record.doc).toEqual(sampleDoc);
    expect(record.chapters).toEqual(sampleChapters);
  });

  it("不存在的 archiveId 抛异常", async () => {
    const svc = await loadService();
    await expect(svc.loadFullArchive("nope")).rejects.toThrow(/not found/);
  });
});

describe("wholeBackupService — renameArchive", () => {
  it("修改 label 后 list 显示新名字", async () => {
    const svc = await loadService();
    const id = await svc.saveManualArchive({
      guideId: "g1",
      label: "original",
      doc: sampleDoc,
      chapters: sampleChapters,
    });
    await svc.renameArchive(id, "renamed");
    const list = await svc.listArchives("g1");
    expect(list[0].label).toBe("renamed");
  });

  it("不存在的 archiveId 抛异常", async () => {
    const svc = await loadService();
    await expect(svc.renameArchive("nope", "x")).rejects.toThrow(/not found/);
  });
});

describe("wholeBackupService — deleteArchive", () => {
  it("删除后 list 不再可见", async () => {
    const svc = await loadService();
    const id = await svc.saveManualArchive({
      guideId: "g1",
      label: "x",
      doc: sampleDoc,
      chapters: sampleChapters,
    });
    await svc.deleteArchive(id);
    const list = await svc.listArchives("g1");
    expect(list).toEqual([]);
  });

  it("删除不存在的 archiveId 静默成功（idempotent）", async () => {
    const svc = await loadService();
    await expect(svc.deleteArchive("nope")).resolves.toBeUndefined();
  });
});
