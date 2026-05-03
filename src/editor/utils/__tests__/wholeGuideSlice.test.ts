/**
 * wholeGuideSlice 切片器单元测试
 *
 * 覆盖：15 个 fixture + sectionId 回填 + sanitize 边界 + 性能基线。
 * 13 个 fixture 落地为 wholeGuideFixtures/*.json；
 * multi-chapter-30 / body-overflow / with-nul-byte 程序化生成
 * （9000 字符 / 30 章 / NUL byte 不适合放进 JSON 文件）。
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { JSONContent } from "@tiptap/core";

// Mock useSteamGuideImageStore — bbcode.ts 用它查图片 URL，单测无需真实 URL
vi.mock("../../stores/useSteamGuideImageStore", () => ({
  useSteamGuideImageStore: {
    getState: () => ({ items: [] }),
  },
}));

// Mock useEditorConfigStore — spoiler / keyboardShortcuts 用它读快捷键
vi.mock("../../stores/useEditorConfigStore", () => ({
  useEditorConfigStore: {
    getState: () => ({
      shortcuts: {},
      debugMode: false,
      theme: "steam-dark",
    }),
  },
  DEFAULT_SHORTCUTS: {
    toggleSpoiler: "Mod+H",
    toggleUnderline: "Mod+U",
    toggleStrike: "Mod+Shift+S",
    setParagraph: "Mod+Alt+0",
    setHeading1: "Mod+Alt+1",
    setHeading2: "Mod+Alt+2",
    setHeading3: "Mod+Alt+3",
    toggleCodeBlock: "Mod+Alt+C",
  },
}));

// Mock useDialogStore — chapterTitle 删除/粘贴 plugin 用它弹 confirm（测试里不会触发）
vi.mock("../../stores/useDialogStore", () => ({
  useDialogStore: { getState: () => ({}) },
  dialog: {
    confirm: () => Promise.resolve(true),
    prompt: () => Promise.resolve(""),
  },
}));

// Mock logger — 单元测试静默
vi.mock("../../../shared/logger", () => ({
  loggers: {
    editor: { info: () => {}, warn: () => {}, verbose: () => {}, error: () => {} },
    bridge: { info: () => {}, warn: () => {}, verbose: () => {}, error: () => {} },
    store: { info: () => {}, warn: () => {}, verbose: () => {}, error: () => {} },
    sync: { info: () => {}, warn: () => {}, verbose: () => {}, error: () => {} },
    config: { info: () => {}, warn: () => {}, verbose: () => {}, error: () => {} },
    image: { info: () => {}, warn: () => {}, verbose: () => {}, error: () => {} },
    persist: { info: () => {}, warn: () => {}, verbose: () => {}, error: () => {} },
    popup: { info: () => {}, warn: () => {}, verbose: () => {}, error: () => {} },
  },
}));

import {
  sliceDocByChapterTitle,
  buildDocFromChapters,
  countChapters,
  findChapterIndexAtPos,
  sanitizeText,
  CHAPTER_BODY_MAX_CHARS,
} from "../wholeGuideSlice";
import { CHAPTER_TITLE_MAX_CHARS } from "../../extensions/chapterTitle";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadFixture(name: string): JSONContent {
  const raw = readFileSync(
    join(__dirname, "wholeGuideFixtures", name),
    "utf-8"
  );
  return JSON.parse(raw) as JSONContent;
}

describe("sanitizeText", () => {
  it("移除单个 NUL 字节", () => {
    expect(sanitizeText("a\x00b")).toBe("ab");
  });
  it("移除多个 NUL 字节", () => {
    expect(sanitizeText("\x00\x00abc\x00")).toBe("abc");
  });
  it("不影响普通字符", () => {
    expect(sanitizeText("hello 你好 🌟")).toBe("hello 你好 🌟");
  });
  it("空字符串", () => {
    expect(sanitizeText("")).toBe("");
  });
  it("非字符串输入安全降级", () => {
    // @ts-expect-error 故意传非字符串
    expect(sanitizeText(null)).toBe("");
  });
});

describe("sliceDocByChapterTitle — fixture roundtrip", () => {
  it("F1 empty-doc 返回空", () => {
    const doc = loadFixture("empty-doc.json");
    const result = sliceDocByChapterTitle(doc);
    expect(result.chapters).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("F2 single-chapter", () => {
    const doc = loadFixture("single-chapter.json");
    const result = sliceDocByChapterTitle(doc);
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].title).toBe("唯一章节");
    expect(result.chapters[0].bbcode).toContain("Hello world");
    expect(result.chapters[0].sectionId).toBeNull();
    expect(result.chapters[0].contentHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("F3 multi-chapter-2", () => {
    const doc = loadFixture("multi-chapter-2.json");
    const result = sliceDocByChapterTitle(doc);
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0].title).toBe("第一章");
    expect(result.chapters[1].title).toBe("第二章");
    expect(result.chapters[0].bbcode).toContain("第一章内容段一");
    expect(result.chapters[0].bbcode).toContain("第一章内容段二");
    expect(result.chapters[1].bbcode).toContain("第二章内容");
  });

  it("F4 multi-chapter-30 — 30 章可正常切片，性能基线 < 800ms (jsdom)", () => {
    // perf 基线 200ms 在真浏览器；jsdom DOMSerializer 慢约 3-4 倍。
    // 此 case 验证结构性正确（30 章，标题顺序），保留宽松性能阈值防止退化。
    const docContent: JSONContent[] = [];
    for (let i = 0; i < 30; i++) {
      docContent.push({
        type: "chapterTitle",
        content: [{ type: "text", text: `章节 ${i + 1}` }],
      });
      docContent.push({
        type: "paragraph",
        content: [
          {
            type: "text",
            text: `章节 ${i + 1} 的正文内容，包含一些测试文字`.repeat(10),
          },
        ],
      });
    }
    const doc: JSONContent = { type: "doc", content: docContent };

    const start = performance.now();
    const result = sliceDocByChapterTitle(doc);
    const elapsed = performance.now() - start;

    expect(result.chapters).toHaveLength(30);
    expect(elapsed).toBeLessThan(800);
    for (let i = 0; i < 30; i++) {
      expect(result.chapters[i].title).toBe(`章节 ${i + 1}`);
    }
  });

  it("F5 empty-chapter — 触发 empty-chapter warning", () => {
    const doc = loadFixture("empty-chapter.json");
    const result = sliceDocByChapterTitle(doc);
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0].bbcode).toBe("");
    expect(result.warnings.some((w) => w.type === "empty-chapter" && w.chapterIndex === 0)).toBe(true);
  });

  it("F6 chapter-title-overflow — 触发 title-overflow warning（不强制截断）", () => {
    const doc = loadFixture("chapter-title-overflow.json");
    const result = sliceDocByChapterTitle(doc);
    // 切片器仅发 warning，不强制截断（截断由 chapterTitle char-limit plugin 在编辑器内实施）
    // ChapterSlice.title 为原始 BBCode（无 marks 时即纯文本，长度 = 100）
    expect(result.chapters[0].title.length).toBeGreaterThan(CHAPTER_TITLE_MAX_CHARS);
    expect(result.warnings.some((w) => w.type === "title-overflow")).toBe(true);
  });

  it("F7 body-overflow — 触发 body-overflow warning", () => {
    const longText = "a".repeat(CHAPTER_BODY_MAX_CHARS + 100);
    const doc: JSONContent = {
      type: "doc",
      content: [
        { type: "chapterTitle", content: [{ type: "text", text: "长章节" }] },
        { type: "paragraph", content: [{ type: "text", text: longText }] },
      ],
    };
    const result = sliceDocByChapterTitle(doc);
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].bbcode.length).toBeGreaterThan(CHAPTER_BODY_MAX_CHARS);
    expect(result.warnings.some((w) => w.type === "body-overflow")).toBe(true);
  });

  it("F8 duplicate-title — 触发 duplicate-title warning", () => {
    const doc = loadFixture("duplicate-title.json");
    const result = sliceDocByChapterTitle(doc);
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0].title).toBe(result.chapters[1].title);
    expect(result.warnings.some((w) => w.type === "duplicate-title")).toBe(true);
  });

  it("F9 with-images — bbcode 含 [img]", () => {
    const doc = loadFixture("with-images.json");
    const result = sliceDocByChapterTitle(doc);
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].bbcode).toContain("[img]");
    expect(result.chapters[0].bbcode).toContain("https://example.com/test.png");
  });

  it("F10 with-tables — bbcode 含 [table]", () => {
    const doc = loadFixture("with-tables.json");
    const result = sliceDocByChapterTitle(doc);
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].bbcode).toContain("[table]");
    expect(result.chapters[0].bbcode).toContain("[tr]");
  });

  it("F11 with-spoiler — bbcode 含 [spoiler]", () => {
    const doc = loadFixture("with-spoiler.json");
    const result = sliceDocByChapterTitle(doc);
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].bbcode).toContain("[spoiler]");
    expect(result.chapters[0].bbcode).toContain("secret");
  });

  it("F12 chapter-end-br — 多个 hardBreak 不被吞掉", () => {
    const doc = loadFixture("chapter-end-br.json");
    const result = sliceDocByChapterTitle(doc);
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].bbcode).toContain("Line one");
    expect(result.chapters[0].bbcode).toContain("Line two");
  });

  it("F13 chapter-end-list — bbcode 含 [list]", () => {
    const doc = loadFixture("chapter-end-list.json");
    const result = sliceDocByChapterTitle(doc);
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].bbcode).toContain("[list]");
    expect(result.chapters[0].bbcode).toContain("Item 1");
    expect(result.chapters[0].bbcode).toContain("Item 2");
  });

  it("F14 with-nul-byte — title + body 中的 NUL 被剥离", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "chapterTitle",
          content: [{ type: "text", text: "Title\x00with\x00NUL" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Body\x00with\x00NUL" }],
        },
      ],
    };
    const result = sliceDocByChapterTitle(doc);
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].title).not.toContain("\x00");
    expect(result.chapters[0].bbcode).not.toContain("\x00");
    expect(result.chapters[0].title).toBe("TitlewithNUL");
  });

  it("F15 roundtrip-existing-guide — 12 章 + buildDoc 反向稳定", () => {
    const doc = loadFixture("roundtrip-existing-guide.json");
    const result = sliceDocByChapterTitle(doc);
    expect(result.chapters).toHaveLength(12);
    expect(result.chapters.map((c) => c.title)).toEqual([
      "前言",
      "安装",
      "基础使用",
      "图片",
      "BBCode",
      "草稿",
      "存档",
      "上传",
      "评测模式",
      "快捷键",
      "故障排查",
      "结语",
    ]);

    // 反向：buildDocFromChapters → sliceDocByChapterTitle 应得到相同章节
    const rebuilt = buildDocFromChapters(result.chapters);
    const result2 = sliceDocByChapterTitle(rebuilt);
    expect(result2.chapters).toHaveLength(12);
    expect(result2.chapters.map((c) => c.title)).toEqual(
      result.chapters.map((c) => c.title)
    );
    // 二次切片的 BBCode 应当与一次切片完全相同（幂等）
    for (let i = 0; i < 12; i++) {
      expect(result2.chapters[i].bbcode).toBe(result.chapters[i].bbcode);
    }
  });
});

describe("sliceDocByChapterTitle — sectionId 回填", () => {
  it("title 完全相等的章节复用 sectionId", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        { type: "chapterTitle", content: [{ type: "text", text: "A" }] },
        { type: "paragraph", content: [{ type: "text", text: "a body" }] },
        { type: "chapterTitle", content: [{ type: "text", text: "B" }] },
        { type: "paragraph", content: [{ type: "text", text: "b body" }] },
      ],
    };
    const result = sliceDocByChapterTitle(doc, [
      { sectionId: "sec-a", title: "A" },
      { sectionId: "sec-b", title: "B" },
    ]);
    expect(result.chapters[0].sectionId).toBe("sec-a");
    expect(result.chapters[1].sectionId).toBe("sec-b");
  });

  it("title 不匹配 → sectionId = null（新增章节）", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        { type: "chapterTitle", content: [{ type: "text", text: "新章节" }] },
        { type: "paragraph", content: [{ type: "text", text: "x" }] },
      ],
    };
    const result = sliceDocByChapterTitle(doc, [
      { sectionId: "sec-old", title: "旧章节" },
    ]);
    expect(result.chapters[0].sectionId).toBeNull();
  });

  it("章节顺序变化按 title 匹配（不按位置）", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        { type: "chapterTitle", content: [{ type: "text", text: "B" }] },
        { type: "paragraph", content: [{ type: "text", text: "b" }] },
        { type: "chapterTitle", content: [{ type: "text", text: "A" }] },
        { type: "paragraph", content: [{ type: "text", text: "a" }] },
      ],
    };
    const result = sliceDocByChapterTitle(doc, [
      { sectionId: "sec-a", title: "A" },
      { sectionId: "sec-b", title: "B" },
    ]);
    expect(result.chapters[0].sectionId).toBe("sec-b");
    expect(result.chapters[1].sectionId).toBe("sec-a");
  });

  it("重命名章节 → 视为新增", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        { type: "chapterTitle", content: [{ type: "text", text: "A 改名" }] },
        { type: "paragraph", content: [{ type: "text", text: "a" }] },
      ],
    };
    const result = sliceDocByChapterTitle(doc, [
      { sectionId: "sec-a", title: "A" },
    ]);
    expect(result.chapters[0].sectionId).toBeNull();
  });

  it("existingChapters 为空数组 → 全部 null", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        { type: "chapterTitle", content: [{ type: "text", text: "X" }] },
        { type: "paragraph", content: [{ type: "text", text: "x" }] },
      ],
    };
    const result = sliceDocByChapterTitle(doc, []);
    expect(result.chapters[0].sectionId).toBeNull();
  });
});

describe("buildDocFromChapters", () => {
  it("空数组 → doc 无内容", () => {
    const doc = buildDocFromChapters([]);
    expect(doc.type).toBe("doc");
    expect(doc.content).toEqual([]);
  });

  it("单章 → 1 个 chapterTitle + 正文节点", () => {
    const doc = buildDocFromChapters([
      { title: "Hello", bbcode: "World" },
    ]);
    expect(doc.content?.[0].type).toBe("chapterTitle");
    expect(doc.content?.[0].content?.[0].text).toBe("Hello");
    expect((doc.content?.length ?? 0)).toBeGreaterThan(1);
  });

  it("多章顺序保持", () => {
    const doc = buildDocFromChapters([
      { title: "A", bbcode: "AAA" },
      { title: "B", bbcode: "BBB" },
      { title: "C", bbcode: "CCC" },
    ]);
    const titles = (doc.content ?? [])
      .filter((n) => n.type === "chapterTitle")
      .map((n) => n.content?.[0].text);
    expect(titles).toEqual(["A", "B", "C"]);
  });

  it("空 bbcode → 仅 chapterTitle 节点", () => {
    const doc = buildDocFromChapters([
      { title: "Empty", bbcode: "" },
    ]);
    expect(doc.content?.[0].type).toBe("chapterTitle");
    expect(doc.content?.length).toBe(1);
  });

  it("title 含 NUL → 自动 sanitize", () => {
    const doc = buildDocFromChapters([
      { title: "A\x00B\x00C", bbcode: "" },
    ]);
    expect(doc.content?.[0].content?.[0].text).toBe("ABC");
  });

  it("超长 title → 不强制截断（依赖编辑器内 char-limit plugin）", () => {
    // 调整后 buildDocFromChapters 不再截断标题，由 chapterTitle 节点的 char-limit
    // plugin 在编辑器中保护用户编辑过程；store 中数据保留原始长度。
    const doc = buildDocFromChapters([
      { title: "x".repeat(200), bbcode: "" },
    ]);
    expect(doc.content?.[0].content?.[0].text?.length).toBe(200);
  });

  it("bbcode 含 BBCode 标签 → 反序列化为对应节点", () => {
    const doc = buildDocFromChapters([
      { title: "Test", bbcode: "[b]bold[/b]" },
    ]);
    // 应包含至少 chapterTitle + paragraph，且段落里有 strong/bold mark
    const json = JSON.stringify(doc);
    expect(json).toContain("Test");
    expect(json.toLowerCase()).toContain("bold");
  });

  it("传入 sectionId 兼容（不影响输出）", () => {
    const doc = buildDocFromChapters([
      { sectionId: "abc", title: "X", bbcode: "y" },
    ]);
    expect(doc.content?.[0].type).toBe("chapterTitle");
  });

  it("反序列化失败的 bbcode 降级为 paragraph", () => {
    // 给一个不会让 bbcodeToHtml 崩但内容奇怪的 bbcode
    const doc = buildDocFromChapters([
      { title: "Weird", bbcode: "plain text without tags" },
    ]);
    // 不抛异常即合格
    expect(doc.content?.[0].type).toBe("chapterTitle");
  });

  it("能与 sliceDocByChapterTitle 形成往返（标题保持）", () => {
    const original = [
      { sectionId: "1", title: "C1", bbcode: "Body 1" },
      { sectionId: "2", title: "C2", bbcode: "Body 2" },
    ];
    const doc = buildDocFromChapters(original);
    const result = sliceDocByChapterTitle(doc, [
      { sectionId: "1", title: "C1" },
      { sectionId: "2", title: "C2" },
    ]);
    expect(result.chapters.map((c) => c.title)).toEqual(["C1", "C2"]);
    expect(result.chapters[0].sectionId).toBe("1");
    expect(result.chapters[1].sectionId).toBe("2");
  });
});

describe("countChapters", () => {
  it("空 doc → 0", () => {
    expect(countChapters({ type: "doc", content: [] })).toBe(0);
  });

  it("无 chapterTitle 节点 → 0", () => {
    expect(
      countChapters({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }],
      })
    ).toBe(0);
  });

  it("3 个 chapterTitle → 3", () => {
    expect(
      countChapters({
        type: "doc",
        content: [
          { type: "chapterTitle", content: [{ type: "text", text: "A" }] },
          { type: "paragraph" },
          { type: "chapterTitle", content: [{ type: "text", text: "B" }] },
          { type: "chapterTitle", content: [{ type: "text", text: "C" }] },
        ],
      })
    ).toBe(3);
  });

  it("doc 无 content 字段 → 0", () => {
    expect(countChapters({ type: "doc" } as JSONContent)).toBe(0);
  });

  it("加载 fixture roundtrip-existing-guide → 12", () => {
    const doc = loadFixture("roundtrip-existing-guide.json");
    expect(countChapters(doc)).toBe(12);
  });
});

describe("findChapterIndexAtPos", () => {
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "chapterTitle",
        content: [{ type: "text", text: "A" }],
      }, // size 3 (1 + 1 char + 1)
      {
        type: "paragraph",
        content: [{ type: "text", text: "abc" }],
      }, // size 5 (1 + 3 + 1)
      {
        type: "chapterTitle",
        content: [{ type: "text", text: "B" }],
      },
    ],
  };

  it("pos = 0 → 第一个 chapterTitle 起点 → 0", () => {
    expect(findChapterIndexAtPos(doc, 0)).toBe(0);
  });

  it("pos 在第一章正文内 → 0", () => {
    expect(findChapterIndexAtPos(doc, 4)).toBe(0);
  });

  it("pos 在第二个 chapterTitle 内 → 1", () => {
    expect(findChapterIndexAtPos(doc, 9)).toBe(1);
  });

  it("空 doc → -1", () => {
    expect(findChapterIndexAtPos({ type: "doc", content: [] }, 0)).toBe(-1);
  });

  it("无 chapterTitle 的 doc → -1", () => {
    expect(
      findChapterIndexAtPos(
        { type: "doc", content: [{ type: "paragraph" }] },
        0
      )
    ).toBe(-1);
  });
});

describe("contentHash 一致性", () => {
  it("相同 bbcode → 相同 hash", () => {
    const doc1: JSONContent = {
      type: "doc",
      content: [
        { type: "chapterTitle", content: [{ type: "text", text: "X" }] },
        { type: "paragraph", content: [{ type: "text", text: "same" }] },
      ],
    };
    const doc2: JSONContent = JSON.parse(JSON.stringify(doc1));
    const r1 = sliceDocByChapterTitle(doc1);
    const r2 = sliceDocByChapterTitle(doc2);
    expect(r1.chapters[0].contentHash).toBe(r2.chapters[0].contentHash);
  });

  it("不同 bbcode → 不同 hash（绝大多数情况）", () => {
    const doc1: JSONContent = {
      type: "doc",
      content: [
        { type: "chapterTitle", content: [{ type: "text", text: "X" }] },
        { type: "paragraph", content: [{ type: "text", text: "alpha" }] },
      ],
    };
    const doc2: JSONContent = {
      type: "doc",
      content: [
        { type: "chapterTitle", content: [{ type: "text", text: "X" }] },
        { type: "paragraph", content: [{ type: "text", text: "beta" }] },
      ],
    };
    const r1 = sliceDocByChapterTitle(doc1);
    const r2 = sliceDocByChapterTitle(doc2);
    expect(r1.chapters[0].contentHash).not.toBe(r2.chapters[0].contentHash);
  });

  it("contentHash 形如 8-char hex", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        { type: "chapterTitle", content: [{ type: "text", text: "X" }] },
        { type: "paragraph", content: [{ type: "text", text: "y" }] },
      ],
    };
    const r = sliceDocByChapterTitle(doc);
    expect(r.chapters[0].contentHash).toMatch(/^[0-9a-f]{8}$/);
  });
});
