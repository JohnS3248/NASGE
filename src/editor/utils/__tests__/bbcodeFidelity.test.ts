import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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

import { bbcodeToHtml, htmlToBBCode } from "../bbcode";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadFixture(name: string): string {
  return readFileSync(join(__dirname, "fixtures", name), "utf-8");
}

function normalize(bbcode: string): string {
  return bbcode.replace(/\r\n/g, "\n").replace(/\n+$/, "");
}

function assertStrictRoundtrip(input: string, label?: string) {
  const html = bbcodeToHtml(input);
  const output = htmlToBBCode(html);
  if (normalize(output) !== normalize(input)) {
    console.error(`\n--- ${label ?? "roundtrip"} ---`);
    console.error("INPUT :", JSON.stringify(normalize(input)));
    console.error("HTML  :", html);
    console.error("OUTPUT:", JSON.stringify(normalize(output)));
  }
  expect(normalize(output)).toBe(normalize(input));
}

// ============================================================
// HTML 特殊字符 — author 写在 BBCode 中的字面 < > & 必须原样保留
// 不能被 DOM parser 当成真 HTML 解析（之前的 bug:<html> 字面字符串
// 会被解析成 unknown HTML element,内容丢失或位置错位）
// ============================================================
describe("HTML special chars — strict roundtrip", () => {
  it("字面 < > 单独使用", () => {
    assertStrictRoundtrip("a < b > c");
  });

  it("字面 <html> 标签字符串", () => {
    assertStrictRoundtrip("<html>");
  });

  it("字面 <html>...</html> 配对", () => {
    assertStrictRoundtrip("<html>content</html>");
  });

  it("字面 & 单独使用", () => {
    assertStrictRoundtrip("a & b");
  });

  it("字面 &amp; 字符串(不应被 DOM 解码为 &)", () => {
    assertStrictRoundtrip("&amp;");
  });

  it("字面 &lt; &gt; 字符串", () => {
    assertStrictRoundtrip("&lt;tag&gt;");
  });

  it("混合 entity 和字面 < > & 字符串", () => {
    assertStrictRoundtrip(`<html>&amp;&lt;&gt;"'</html>`);
  });

  it("段落中混入 HTML 字面字符", () => {
    assertStrictRoundtrip("普通文字 < 比较 > 测试 & 符号");
  });

  it("[code] 块内字面 < > & 应保留", () => {
    assertStrictRoundtrip("[code]<html>&amp;</html>[/code]");
  });

  it("[quote] 内字面 < > 应保留", () => {
    assertStrictRoundtrip("[quote]<html>[/quote]");
  });

  it("[h2] 内字面 < > 应保留", () => {
    assertStrictRoundtrip("[h2]title with <tag>[/h2]");
  });

  it("[b] 内字面 < > 应保留", () => {
    assertStrictRoundtrip("[b]<bold>[/b]");
  });
});

// ============================================================
// Fixture 04 含 11.1 段 HTML 特殊字符,整段 round-trip 后该段必须保留
// (整 fixture 不要求严格相等,因为类别 1/3 在 BBCode 层不保真,
// 这部分由 diff 层的 normalize 处理)
// ============================================================
describe("Fixture — real chapter mixed (11.1 HTML special chars)", () => {
  it("11.1 段 HTML 字面字符串经 round-trip 必须保留", () => {
    const bbcode = loadFixture("real-chapter-mixed.bbcode.txt");
    const html = bbcodeToHtml(bbcode);
    const output = htmlToBBCode(html);
    // 11.1 段原文:<html>&amp;&lt;&gt;"'</html>
    expect(output).toContain(`<html>&amp;&lt;&gt;"'</html>`);
  });
});
