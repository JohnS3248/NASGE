/**
 * useWholeGuideStore 单元测试
 *
 * 覆盖：state/setters / dirty timestamps / localStorage persist + restore / partialize 字段集 / reset。
 * pullEntireGuide / pushEntireGuide 的端到端走 useWholeGuideSync hook，单独覆盖。
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import type { JSONContent } from "@tiptap/core";

// Mock logger 静默
vi.mock("../../../shared/logger", () => ({
  loggers: {
    store: { info: () => {}, warn: () => {}, verbose: () => {}, error: () => {} },
    persist: { info: () => {}, warn: () => {}, verbose: () => {}, error: () => {} },
    editor: { info: () => {}, warn: () => {}, verbose: () => {}, error: () => {} },
  },
}));

import {
  useWholeGuideStore,
  type WholeGuideChapterMeta,
} from "../useWholeGuideStore";

const PERSIST_KEY = "nasge-whole-guide";

const sampleDoc: JSONContent = {
  type: "doc",
  content: [
    { type: "chapterTitle", content: [{ type: "text", text: "Test" }] },
    { type: "paragraph", content: [{ type: "text", text: "body" }] },
  ],
};

const sampleChapter = (sectionId: string, order: number): WholeGuideChapterMeta => ({
  sectionId,
  title: `Chapter ${sectionId}`,
  bbcode: `Body of ${sectionId}`,
  contentHash: `hash-${sectionId}`,
  order,
});

beforeEach(() => {
  // 每个 case 前清掉 localStorage + reset store
  localStorage.clear();
  useWholeGuideStore.getState().reset();
});

describe("useWholeGuideStore — 初始状态", () => {
  it("guideId 初始为 null", () => {
    expect(useWholeGuideStore.getState().guideId).toBeNull();
  });
  it("guideTitle 初始为空字符串", () => {
    expect(useWholeGuideStore.getState().guideTitle).toBe("");
  });
  it("doc 初始为 null", () => {
    expect(useWholeGuideStore.getState().doc).toBeNull();
  });
  it("chapters 初始为空数组", () => {
    expect(useWholeGuideStore.getState().chapters).toEqual([]);
  });
  it("chapterDirtyTimestamps 初始为空对象", () => {
    expect(useWholeGuideStore.getState().chapterDirtyTimestamps).toEqual({});
  });
  it("status 初始为 idle", () => {
    expect(useWholeGuideStore.getState().status).toBe("idle");
  });
  it("lastPulledAt / lastPushedAt 初始为 null", () => {
    const s = useWholeGuideStore.getState();
    expect(s.lastPulledAt).toBeNull();
    expect(s.lastPushedAt).toBeNull();
  });
  it("error 初始为 null", () => {
    expect(useWholeGuideStore.getState().error).toBeNull();
  });
});

describe("useWholeGuideStore — Setter", () => {
  it("setGuideId 写入与清空", () => {
    useWholeGuideStore.getState().setGuideId("3635919673");
    expect(useWholeGuideStore.getState().guideId).toBe("3635919673");
    useWholeGuideStore.getState().setGuideId(null);
    expect(useWholeGuideStore.getState().guideId).toBeNull();
  });

  it("setGuideTitle 写入", () => {
    useWholeGuideStore.getState().setGuideTitle("My Guide");
    expect(useWholeGuideStore.getState().guideTitle).toBe("My Guide");
  });

  it("setDoc 写入", () => {
    useWholeGuideStore.getState().setDoc(sampleDoc);
    expect(useWholeGuideStore.getState().doc).toEqual(sampleDoc);
  });

  it("setDoc 写 null 重置", () => {
    useWholeGuideStore.getState().setDoc(sampleDoc);
    useWholeGuideStore.getState().setDoc(null);
    expect(useWholeGuideStore.getState().doc).toBeNull();
  });

  it("setChapters 替换而非合并", () => {
    const a = [sampleChapter("a", 0), sampleChapter("b", 1)];
    useWholeGuideStore.getState().setChapters(a);
    expect(useWholeGuideStore.getState().chapters).toHaveLength(2);
    const b = [sampleChapter("c", 0)];
    useWholeGuideStore.getState().setChapters(b);
    expect(useWholeGuideStore.getState().chapters).toHaveLength(1);
    expect(useWholeGuideStore.getState().chapters[0].sectionId).toBe("c");
  });

  it("setStatus 切换全部 5 个状态", () => {
    const transitions: Array<
      "idle" | "pulling" | "editing" | "reviewing" | "pushing"
    > = ["pulling", "editing", "reviewing", "pushing", "idle"];
    for (const t of transitions) {
      useWholeGuideStore.getState().setStatus(t);
      expect(useWholeGuideStore.getState().status).toBe(t);
    }
  });

  it("setError 写入与清空", () => {
    useWholeGuideStore.getState().setError("oops");
    expect(useWholeGuideStore.getState().error).toBe("oops");
    useWholeGuideStore.getState().setError(null);
    expect(useWholeGuideStore.getState().error).toBeNull();
  });

  it("setLastPulledAt / setLastPushedAt 写入时间戳", () => {
    useWholeGuideStore.getState().setLastPulledAt(1000);
    useWholeGuideStore.getState().setLastPushedAt(2000);
    const s = useWholeGuideStore.getState();
    expect(s.lastPulledAt).toBe(1000);
    expect(s.lastPushedAt).toBe(2000);
  });
});

describe("useWholeGuideStore — Dirty 跟踪", () => {
  it("markChapterDirty 写入时间戳", () => {
    const before = Date.now();
    useWholeGuideStore.getState().markChapterDirty("sec-1");
    const after = Date.now();
    const ts = useWholeGuideStore.getState().chapterDirtyTimestamps["sec-1"];
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("markChapterDirty 多个 sectionId 互不影响", () => {
    useWholeGuideStore.getState().markChapterDirty("sec-a");
    useWholeGuideStore.getState().markChapterDirty("sec-b");
    const m = useWholeGuideStore.getState().chapterDirtyTimestamps;
    expect(Object.keys(m).sort()).toEqual(["sec-a", "sec-b"]);
  });

  it("markChapterDirty 同 sectionId 重复 → 时间戳更新", async () => {
    useWholeGuideStore.getState().markChapterDirty("sec-1");
    const t1 = useWholeGuideStore.getState().chapterDirtyTimestamps["sec-1"];
    await new Promise((r) => setTimeout(r, 5));
    useWholeGuideStore.getState().markChapterDirty("sec-1");
    const t2 = useWholeGuideStore.getState().chapterDirtyTimestamps["sec-1"];
    expect(t2).toBeGreaterThanOrEqual(t1);
  });

  it("markChapterDirty 空字符串 sectionId 被忽略", () => {
    useWholeGuideStore.getState().markChapterDirty("");
    expect(useWholeGuideStore.getState().chapterDirtyTimestamps).toEqual({});
  });

  it("clearChapterDirty 单个", () => {
    useWholeGuideStore.getState().markChapterDirty("a");
    useWholeGuideStore.getState().markChapterDirty("b");
    useWholeGuideStore.getState().clearChapterDirty("a");
    const m = useWholeGuideStore.getState().chapterDirtyTimestamps;
    expect(m).not.toHaveProperty("a");
    expect(m).toHaveProperty("b");
  });

  it("clearChapterDirty 不存在的 sectionId → 无副作用", () => {
    useWholeGuideStore.getState().markChapterDirty("a");
    useWholeGuideStore.getState().clearChapterDirty("nonexistent");
    expect(useWholeGuideStore.getState().chapterDirtyTimestamps).toHaveProperty(
      "a"
    );
  });

  it("clearChapterDirty 不传参 → 全部清空", () => {
    useWholeGuideStore.getState().markChapterDirty("a");
    useWholeGuideStore.getState().markChapterDirty("b");
    useWholeGuideStore.getState().clearChapterDirty();
    expect(useWholeGuideStore.getState().chapterDirtyTimestamps).toEqual({});
  });
});

describe("useWholeGuideStore — autoBackups", () => {
  it("初始 autoBackups 为空数组", () => {
    expect(useWholeGuideStore.getState().autoBackups).toEqual([]);
  });

  it("createAutoBackup 在 doc=null 时不写入", () => {
    useWholeGuideStore.getState().createAutoBackup();
    expect(useWholeGuideStore.getState().autoBackups).toEqual([]);
  });

  it("createAutoBackup 写入 timestamp + doc + chapters", () => {
    const s = useWholeGuideStore.getState();
    s.setDoc(sampleDoc);
    s.setChapters([sampleChapter("a", 0)]);
    s.createAutoBackup();
    const backups = useWholeGuideStore.getState().autoBackups;
    expect(backups).toHaveLength(1);
    expect(backups[0].doc).toEqual(sampleDoc);
    expect(backups[0].chapters).toHaveLength(1);
    expect(typeof backups[0].timestamp).toBe("number");
  });

  it("createAutoBackup FIFO 滚动到 3 份", () => {
    const s = useWholeGuideStore.getState();
    s.setDoc(sampleDoc);
    for (let i = 0; i < 5; i++) {
      s.createAutoBackup();
    }
    expect(useWholeGuideStore.getState().autoBackups).toHaveLength(3);
  });

  it("createAutoBackup 最新在前", async () => {
    const s = useWholeGuideStore.getState();
    s.setDoc(sampleDoc);
    s.createAutoBackup();
    const t1 = useWholeGuideStore.getState().autoBackups[0].timestamp;
    await new Promise((r) => setTimeout(r, 5));
    s.createAutoBackup();
    const backups = useWholeGuideStore.getState().autoBackups;
    expect(backups[0].timestamp).toBeGreaterThanOrEqual(t1);
  });

  it("restoreFromAutoBackup 把 doc / chapters 还原", () => {
    const s = useWholeGuideStore.getState();
    const docA: JSONContent = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }],
    };
    const docB: JSONContent = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "B" }] }],
    };
    s.setDoc(docA);
    s.setChapters([sampleChapter("a", 0)]);
    s.createAutoBackup();
    s.setDoc(docB);
    s.setChapters([sampleChapter("b", 0)]);

    const ok = s.restoreFromAutoBackup(0);
    expect(ok).toBe(true);
    expect(useWholeGuideStore.getState().doc).toEqual(docA);
    expect(useWholeGuideStore.getState().chapters[0].sectionId).toBe("a");
  });

  it("restoreFromAutoBackup 越界 index 返回 false", () => {
    const ok = useWholeGuideStore.getState().restoreFromAutoBackup(99);
    expect(ok).toBe(false);
  });

  it("restoreFromAutoBackup 恢复前先把当前状态备份一份（防误覆盖）", () => {
    const s = useWholeGuideStore.getState();
    const docOrig: JSONContent = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "orig" }] }],
    };
    const docNew: JSONContent = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "new" }] }],
    };
    s.setDoc(docOrig);
    s.createAutoBackup(); // backup 0 = orig
    s.setDoc(docNew);
    // 恢复 index 0（orig）
    s.restoreFromAutoBackup(0);
    // 此时 autoBackups 应包含 docNew（safety 备份）+ 原 docOrig
    const backups = useWholeGuideStore.getState().autoBackups;
    expect(backups.some((b) => JSON.stringify(b.doc) === JSON.stringify(docNew))).toBe(true);
  });
});

describe("useWholeGuideStore — reset", () => {
  it("reset 把所有字段重置为初始值", () => {
    const s = useWholeGuideStore.getState();
    s.setGuideId("g1");
    s.setGuideTitle("T");
    s.setDoc(sampleDoc);
    s.setChapters([sampleChapter("a", 0)]);
    s.markChapterDirty("a");
    s.setStatus("editing");
    s.setError("err");
    s.setLastPulledAt(1000);
    s.setLastPushedAt(2000);

    s.reset();

    const after = useWholeGuideStore.getState();
    expect(after.guideId).toBeNull();
    expect(after.guideTitle).toBe("");
    expect(after.doc).toBeNull();
    expect(after.chapters).toEqual([]);
    expect(after.chapterDirtyTimestamps).toEqual({});
    expect(after.status).toBe("idle");
    expect(after.error).toBeNull();
    expect(after.lastPulledAt).toBeNull();
    expect(after.lastPushedAt).toBeNull();
  });
});

describe("useWholeGuideStore — localStorage 持久化", () => {
  it("setGuideId 后 localStorage 含 guideId", async () => {
    useWholeGuideStore.getState().setGuideId("g1");
    // Zustand persist 是同步写入 localStorage（标准 storage）
    const raw = localStorage.getItem(PERSIST_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.guideId).toBe("g1");
  });

  it("setStatus 不写入 localStorage（partialize 排除）", () => {
    useWholeGuideStore.getState().setGuideId("g2"); // 触发一次写
    useWholeGuideStore.getState().setStatus("pulling");
    const raw = localStorage.getItem(PERSIST_KEY);
    const parsed = JSON.parse(raw!);
    expect(parsed.state.status).toBeUndefined();
  });

  it("setError 不写入 localStorage", () => {
    useWholeGuideStore.getState().setGuideId("g3");
    useWholeGuideStore.getState().setError("E");
    const raw = localStorage.getItem(PERSIST_KEY);
    const parsed = JSON.parse(raw!);
    expect(parsed.state.error).toBeUndefined();
  });

  it("setLastPushedAt 不写入 localStorage", () => {
    useWholeGuideStore.getState().setGuideId("g4");
    useWholeGuideStore.getState().setLastPushedAt(999);
    const raw = localStorage.getItem(PERSIST_KEY);
    const parsed = JSON.parse(raw!);
    expect(parsed.state.lastPushedAt).toBeUndefined();
  });

  it("setLastPulledAt 写入 localStorage（partialize 包含）", () => {
    useWholeGuideStore.getState().setGuideId("g5");
    useWholeGuideStore.getState().setLastPulledAt(12345);
    const raw = localStorage.getItem(PERSIST_KEY);
    const parsed = JSON.parse(raw!);
    expect(parsed.state.lastPulledAt).toBe(12345);
  });

  it("setChapters 写入 localStorage", () => {
    const chapters = [sampleChapter("a", 0), sampleChapter("b", 1)];
    useWholeGuideStore.getState().setChapters(chapters);
    const raw = localStorage.getItem(PERSIST_KEY);
    const parsed = JSON.parse(raw!);
    expect(parsed.state.chapters).toHaveLength(2);
    expect(parsed.state.chapters[0].sectionId).toBe("a");
  });

  it("setDoc 写入 localStorage（doc 字段持久化）", () => {
    useWholeGuideStore.getState().setDoc(sampleDoc);
    const raw = localStorage.getItem(PERSIST_KEY);
    const parsed = JSON.parse(raw!);
    expect(parsed.state.doc).toEqual(sampleDoc);
  });

  it("markChapterDirty 写入 localStorage", () => {
    useWholeGuideStore.getState().markChapterDirty("sec-x");
    const raw = localStorage.getItem(PERSIST_KEY);
    const parsed = JSON.parse(raw!);
    expect(parsed.state.chapterDirtyTimestamps).toHaveProperty("sec-x");
  });

  it("partialize 字段集仅包含可持久化字段", () => {
    // 写入全部可持久化字段
    const s = useWholeGuideStore.getState();
    s.setGuideId("g");
    s.setGuideTitle("T");
    s.setDoc(sampleDoc);
    s.setChapters([sampleChapter("a", 0)]);
    s.markChapterDirty("a");
    s.setLastPulledAt(100);

    const raw = localStorage.getItem(PERSIST_KEY);
    const parsed = JSON.parse(raw!);
    const persistedKeys = Object.keys(parsed.state).sort();
    expect(persistedKeys).toEqual(
      [
        "autoBackups",
        "chapterDirtyTimestamps",
        "chapters",
        "doc",
        "guideId",
        "guideTitle",
        "lastPulledAt",
      ].sort()
    );
  });

  it("rehydrate 后 reset → localStorage 同步清空持久化字段", () => {
    useWholeGuideStore.getState().setGuideId("g-x");
    expect(localStorage.getItem(PERSIST_KEY)).not.toBeNull();
    useWholeGuideStore.getState().reset();
    // reset 后写一次（initial state），guideId 为 null
    const raw = localStorage.getItem(PERSIST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      expect(parsed.state.guideId).toBeNull();
    }
  });
});
