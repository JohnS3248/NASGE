/**
 * wholeGuideDiff 单元测试 — 字符级 diff 算法
 *
 * 覆盖：
 *   - diffSingleChapter 三类 segment（add/delete/equal）
 *   - diffWholeGuide 章节对齐 / 新增 / 删除 / 顺序变化
 *   - DiffOptions ignoreWhitespace / semanticCleanup / contextLines
 *   - computeStats / aggregateStats
 *   - 性能基线
 */

import { describe, it, expect, vi } from "vitest";

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

import {
  diffSingleChapter,
  diffWholeGuide,
  computeStats,
  aggregateStats,
  collapseEqualContext,
  type DiffSegment,
} from "../wholeGuideDiff";
import type { ChapterSlice } from "../wholeGuideSlice";

// =============================================================================
// diffSingleChapter
// =============================================================================

describe("diffSingleChapter — 基础 segment", () => {
  it("两边完全相同 → 仅一个 equal segment", () => {
    const segs = diffSingleChapter("hello world", "hello world");
    expect(segs).toHaveLength(1);
    expect(segs[0]).toEqual({ op: "equal", text: "hello world" });
  });

  it("纯新增 → 一个 insert segment", () => {
    const segs = diffSingleChapter("", "hello");
    expect(segs).toEqual([{ op: "insert", text: "hello" }]);
  });

  it("纯删除 → 一个 delete segment", () => {
    const segs = diffSingleChapter("hello", "");
    expect(segs).toEqual([{ op: "delete", text: "hello" }]);
  });

  it("局部修改 → equal + delete + insert + equal", () => {
    const segs = diffSingleChapter("abc def ghi", "abc xyz ghi");
    expect(segs.some((s) => s.op === "equal")).toBe(true);
    expect(segs.some((s) => s.op === "insert")).toBe(true);
    expect(segs.some((s) => s.op === "delete")).toBe(true);
    const reconstructed = segs
      .filter((s) => s.op !== "delete")
      .map((s) => s.text)
      .join("");
    expect(reconstructed).toBe("abc xyz ghi");
  });

  it("中文修改", () => {
    const segs = diffSingleChapter("第一段内容", "第一段内容修改");
    const insertText = segs
      .filter((s) => s.op === "insert")
      .map((s) => s.text)
      .join("");
    expect(insertText).toContain("修改");
  });

  it("BBCode 标签变化", () => {
    const segs = diffSingleChapter("[b]X[/b]", "[i]X[/i]");
    expect(segs.length).toBeGreaterThan(1);
    const stats = computeStats(segs);
    expect(stats.additions).toBeGreaterThan(0);
    expect(stats.deletions).toBeGreaterThan(0);
  });
});

describe("diffSingleChapter — DiffOptions", () => {
  it("ignoreWhitespace=true 折叠多余空白", () => {
    const segs = diffSingleChapter("hello   world", "hello world", {
      ignoreWhitespace: true,
    });
    expect(segs).toHaveLength(1);
    expect(segs[0].op).toBe("equal");
  });

  it("ignoreWhitespace=false 保留空白差异", () => {
    const segs = diffSingleChapter("hello   world", "hello world", {
      ignoreWhitespace: false,
    });
    expect(segs.length).toBeGreaterThan(1);
  });

  it("semanticCleanup 合并语义相近段", () => {
    // 没有 cleanup 时可能出 a/x/b/y 多段；启用后段更连贯
    const noClean = diffSingleChapter(
      "The quick brown fox jumps over the lazy dog",
      "The slow brown fox leaps over the lazy cat",
      { semanticCleanup: false }
    );
    const clean = diffSingleChapter(
      "The quick brown fox jumps over the lazy dog",
      "The slow brown fox leaps over the lazy cat",
      { semanticCleanup: true }
    );
    // 两边重建结果都应等于 new
    const reA = noClean.filter((s) => s.op !== "delete").map((s) => s.text).join("");
    const reB = clean.filter((s) => s.op !== "delete").map((s) => s.text).join("");
    expect(reA).toBe("The slow brown fox leaps over the lazy cat");
    expect(reB).toBe("The slow brown fox leaps over the lazy cat");
  });
});

describe("computeStats", () => {
  it("数 add/del/equal 字符数", () => {
    const segs: DiffSegment[] = [
      { op: "equal", text: "abc" },
      { op: "insert", text: "XYZ" },
      { op: "delete", text: "kk" },
    ];
    expect(computeStats(segs)).toEqual({
      additions: 3,
      deletions: 2,
      unchanged: 3,
    });
  });

  it("空数组 → 全 0", () => {
    expect(computeStats([])).toEqual({
      additions: 0,
      deletions: 0,
      unchanged: 0,
    });
  });
});

// =============================================================================
// diffWholeGuide
// =============================================================================

const makeSlice = (
  sectionId: string | null,
  title: string,
  bbcode: string
): ChapterSlice => ({
  sectionId,
  title,
  bbcode,
  contentHash: "fake",
});

describe("diffWholeGuide — 章节对齐", () => {
  it("全相同章节 → 无变化", () => {
    const old = [
      { sectionId: "s1", title: "A", bbcode: "Body A" },
      { sectionId: "s2", title: "B", bbcode: "Body B" },
    ];
    const slices = [
      makeSlice("s1", "A", "Body A"),
      makeSlice("s2", "B", "Body B"),
    ];
    const results = diffWholeGuide(old, slices);
    expect(results).toHaveLength(2);
    expect(results.every((r) => !r.hasChanges)).toBe(true);
  });

  it("修改单章 → 该章 hasChanges=true", () => {
    const old = [{ sectionId: "s1", title: "A", bbcode: "Body A" }];
    const slices = [makeSlice("s1", "A", "Body A modified")];
    const results = diffWholeGuide(old, slices);
    expect(results[0].hasChanges).toBe(true);
    expect(results[0].stats.additions).toBeGreaterThan(0);
  });

  it("新增章节（slice.sectionId=null）→ isNew=true，整段 insert", () => {
    const old = [{ sectionId: "s1", title: "Existing", bbcode: "old body" }];
    const slices = [
      makeSlice("s1", "Existing", "old body"),
      makeSlice(null, "Brand New", "new body"),
    ];
    const results = diffWholeGuide(old, slices);
    expect(results).toHaveLength(2);
    const newCh = results.find((r) => r.title === "Brand New");
    expect(newCh?.isNew).toBe(true);
    expect(newCh?.hasChanges).toBe(true);
    expect(newCh?.segments).toEqual([{ op: "insert", text: "new body" }]);
  });

  it("远程独有章节 → isDeleted=true，整段 delete", () => {
    const old = [
      { sectionId: "s1", title: "Keep", bbcode: "keep body" },
      { sectionId: "s2", title: "Remove", bbcode: "remove body" },
    ];
    const slices = [makeSlice("s1", "Keep", "keep body")];
    const results = diffWholeGuide(old, slices);
    expect(results).toHaveLength(2);
    const removed = results.find((r) => r.sectionId === "s2");
    expect(removed?.isDeleted).toBe(true);
    expect(removed?.hasChanges).toBe(true);
    expect(removed?.segments).toEqual([{ op: "delete", text: "remove body" }]);
  });

  it("章节顺序变化按 sectionId 对齐（不视作新增 / 删除）", () => {
    const old = [
      { sectionId: "s1", title: "A", bbcode: "body A" },
      { sectionId: "s2", title: "B", bbcode: "body B" },
    ];
    // 切片顺序反转
    const slices = [
      makeSlice("s2", "B", "body B"),
      makeSlice("s1", "A", "body A"),
    ];
    const results = diffWholeGuide(old, slices);
    expect(results).toHaveLength(2);
    expect(results.every((r) => !r.hasChanges)).toBe(true);
    expect(results.every((r) => !r.isNew && !r.isDeleted)).toBe(true);
  });

  it("空 oldChapters + 全新 slices → 全部 isNew", () => {
    const slices = [
      makeSlice(null, "A", "a"),
      makeSlice(null, "B", "b"),
    ];
    const results = diffWholeGuide([], slices);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.isNew)).toBe(true);
  });

  it("空 slices + 全旧 oldChapters → 全部 isDeleted", () => {
    const old = [
      { sectionId: "s1", title: "A", bbcode: "a" },
      { sectionId: "s2", title: "B", bbcode: "b" },
    ];
    const results = diffWholeGuide(old, []);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.isDeleted)).toBe(true);
  });

  it("空 oldChapters + 空 slices → 空数组", () => {
    expect(diffWholeGuide([], [])).toEqual([]);
  });
});

describe("aggregateStats", () => {
  it("聚合多章节 stats", () => {
    const old = [
      { sectionId: "s1", title: "A", bbcode: "abc" },
      { sectionId: "s2", title: "B", bbcode: "def" },
    ];
    const slices = [
      makeSlice("s1", "A", "abc xyz"),
      makeSlice("s2", "B", "def"),
    ];
    const results = diffWholeGuide(old, slices);
    const agg = aggregateStats(results);
    expect(agg.changedCount).toBe(1);
    expect(agg.totalAdditions).toBeGreaterThan(0);
    expect(agg.totalDeletions).toBe(0);
  });

  it("无变化时 changedCount=0", () => {
    const old = [{ sectionId: "s1", title: "A", bbcode: "x" }];
    const slices = [makeSlice("s1", "A", "x")];
    const agg = aggregateStats(diffWholeGuide(old, slices));
    expect(agg.changedCount).toBe(0);
  });
});

describe("collapseEqualContext", () => {
  it("contextLines=0 → 不折叠", () => {
    const segs: DiffSegment[] = [
      { op: "equal", text: "line1\nline2\nline3\nline4\nline5\nline6\nline7" },
    ];
    const out = collapseEqualContext(segs, 0);
    expect(out).toEqual(segs);
  });

  it("中间长 equal 段 → 折叠中间", () => {
    const longEqual = Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join(
      "\n"
    );
    const segs: DiffSegment[] = [
      { op: "insert", text: "X\n" },
      { op: "equal", text: longEqual },
      { op: "delete", text: "Y\n" },
    ];
    const out = collapseEqualContext(segs, 2);
    expect(out.length).toBeGreaterThan(segs.length); // 中间被拆为 head/middle/tail
    const middle = out.find((s) => s.text.includes("行未变"));
    expect(middle).toBeDefined();
  });

  it("短 equal 段 → 不折叠", () => {
    const segs: DiffSegment[] = [
      { op: "equal", text: "a\nb\nc" }, // 3 行
    ];
    const out = collapseEqualContext(segs, 2);
    expect(out).toEqual(segs); // 3 行 ≤ 2*2+1 = 5 → 不折叠
  });
});

describe("性能基线", () => {
  it("30 章 × ~8000 字符 整篇 diff < 5s（含 jsdom 慢速）", () => {
    const old = Array.from({ length: 30 }, (_, i) => ({
      sectionId: `s${i}`,
      title: `章节 ${i}`,
      bbcode: `内容 ${i} `.repeat(800),
    }));
    const slices = Array.from({ length: 30 }, (_, i) =>
      makeSlice(`s${i}`, `章节 ${i}`, `内容 ${i} 修改`.repeat(800))
    );
    const start = performance.now();
    const results = diffWholeGuide(old, slices);
    const elapsed = performance.now() - start;
    expect(results).toHaveLength(30);
    expect(elapsed).toBeLessThan(5000);
  });
});
