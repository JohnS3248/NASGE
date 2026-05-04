import { describe, expect, it, vi } from "vitest";

vi.mock("../../stores/useSteamGuideImageStore", () => ({
  useSteamGuideImageStore: {
    getState: () => ({ items: [] })
  }
}));

vi.mock("../../../shared/logger", () => ({
  loggers: {
    editor: { info: () => {}, warn: () => {}, verbose: () => {}, debug: () => {} },
    bridge: { info: () => {}, warn: () => {}, verbose: () => {} },
    store: { info: () => {}, warn: () => {}, verbose: () => {} },
    sync: { info: () => {}, warn: () => {}, verbose: () => {} },
    config: { info: () => {}, warn: () => {}, verbose: () => {} },
    image: { info: () => {}, warn: () => {}, verbose: () => {} },
    persist: { info: () => {}, warn: () => {}, verbose: () => {} }
  }
}));

import {
  bbcodeToNormalizedHtml,
  richDiffSingleChapter,
  richDiffWholeGuide,
} from "../wholeGuideRichDiff";

describe("bbcodeToNormalizedHtml", () => {
  it("空字符串 → 空", () => {
    expect(bbcodeToNormalizedHtml("")).toBe("");
    expect(bbcodeToNormalizedHtml("   \n  ")).toBe("");
  });

  it("纯文本", () => {
    const html = bbcodeToNormalizedHtml("hello world");
    expect(html).toContain("hello world");
  });

  it("嵌套 inline marks 顺序应被规范化(类别 1)", () => {
    // [i][b]X[/b][/i] 与 [b][i]X[/i][/b] 渲染等价
    // TipTap 应把它们规范化到同一 HTML 形式
    const a = bbcodeToNormalizedHtml("[i][b]X[/b][/i]");
    const b = bbcodeToNormalizedHtml("[b][i]X[/i][/b]");
    expect(a).toBe(b);
  });

  it("previewicon (inline+sizeFull) 与 previewimg 应规范化为同一形式(类别 3)", () => {
    // Steam 官方两种都接受,NASGE 在 push 时把 inline+sizeFull 统一序列化为 previewimg
    // 此处验证 normalize 后两边相等(消除 NASGE 自身改写的 noise)
    const a = bbcodeToNormalizedHtml(
      "[previewicon=12345;sizeFull,inline;name.png][/previewicon]"
    );
    const b = bbcodeToNormalizedHtml(
      "[previewimg=12345;sizeFull,inline;name.png][/previewimg]"
    );
    expect(a).toBe(b);
  });
});

describe("richDiffSingleChapter", () => {
  it("相同内容 → no changes", () => {
    const r = richDiffSingleChapter("hello world", "hello world");
    expect(r.hasChanges).toBe(false);
    expect(r.stats.additions).toBe(0);
    expect(r.stats.deletions).toBe(0);
  });

  it("嵌套 marks 顺序差异(类别 1) → 视为无改动", () => {
    const r = richDiffSingleChapter("[i][b]X[/b][/i]", "[b][i]X[/i][/b]");
    expect(r.hasChanges).toBe(false);
  });

  it("加几个字符 → 含 <ins>", () => {
    const r = richDiffSingleChapter("hello", "hello world");
    expect(r.hasChanges).toBe(true);
    expect(r.diffHtml).toContain("<ins");
    expect(r.stats.additions).toBeGreaterThan(0);
    expect(r.stats.deletions).toBe(0);
  });

  it("删除字符 → 含 <del>", () => {
    const r = richDiffSingleChapter("hello world", "hello");
    expect(r.hasChanges).toBe(true);
    expect(r.diffHtml).toContain("<del");
    expect(r.stats.deletions).toBeGreaterThan(0);
  });

  it("修改格式(添加 [b]) → diff 包含格式标签变化", () => {
    const r = richDiffSingleChapter("hello", "[b]hello[/b]");
    expect(r.hasChanges).toBe(true);
    // 应该有 <ins> 包 strong 标签
    expect(r.diffHtml).toContain("<ins");
    expect(r.diffHtml).toContain("<strong>");
  });

  it("中文字符级 diff", () => {
    const r = richDiffSingleChapter("章节标题", "章节新标题");
    expect(r.hasChanges).toBe(true);
    expect(r.stats.additions).toBe(1); // 加 "新"
    // diff html 内 "新" 字应被 ins 包裹
    expect(r.diffHtml).toMatch(/<ins[^>]*>新<\/ins>/);
  });

  it("HTML 特殊字符(类别 2)经 normalize 后保留", () => {
    const r = richDiffSingleChapter("<html>", "<html>");
    expect(r.hasChanges).toBe(false);
    // diff html 应包含 escape 后的 entity (避免 dangerouslySetInnerHTML 把它当真 HTML)
    expect(r.diffHtml).toContain("&lt;html&gt;");
  });
});

describe("richDiffWholeGuide", () => {
  it("章节对齐 - 修改一章", () => {
    const old = [
      { sectionId: "1", title: "A", bbcode: "hello" },
      { sectionId: "2", title: "B", bbcode: "world" },
    ];
    const newSlices = [
      { sectionId: "1", title: "A", bbcode: "hello world", contentHash: "h1" },
      { sectionId: "2", title: "B", bbcode: "world", contentHash: "h2" },
    ];
    const results = richDiffWholeGuide(old, newSlices);
    expect(results).toHaveLength(2);
    expect(results[0].hasChanges).toBe(true);
    expect(results[1].hasChanges).toBe(false);
  });

  it("新增章节 → isNew + 整章 ins 包裹", () => {
    const old: { sectionId: string; title: string; bbcode: string }[] = [];
    const newSlices = [
      { sectionId: null, title: "新章", bbcode: "全新内容", contentHash: "h" },
    ];
    const results = richDiffWholeGuide(old, newSlices);
    expect(results).toHaveLength(1);
    expect(results[0].isNew).toBe(true);
    expect(results[0].diffHtml).toContain("<ins");
  });

  it("删除章节 → isDeleted + 整章 del 包裹", () => {
    const old = [
      { sectionId: "1", title: "旧章", bbcode: "旧内容" },
    ];
    const newSlices: { sectionId: string | null; title: string; bbcode: string; contentHash: string }[] = [];
    const results = richDiffWholeGuide(old, newSlices);
    expect(results).toHaveLength(1);
    expect(results[0].isDeleted).toBe(true);
    expect(results[0].diffHtml).toContain("<del");
  });
});
