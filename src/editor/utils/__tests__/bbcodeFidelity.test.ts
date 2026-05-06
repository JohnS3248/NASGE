import { describe, expect, it, vi } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { diff_match_patch } from "diff-match-patch";

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
// [noparse] 内部任何字符都是字面,不被解析
// 关键 case:noparse 内的 [b][/b] 等 BBCode 标签作字面字符串保留
// ============================================================
describe("[noparse] — 内部字面保留", () => {
  it("noparse 内含 [b]", () => {
    assertStrictRoundtrip("[noparse][b]字面[/b][/noparse]");
  });

  it("noparse 内含 [h1]", () => {
    assertStrictRoundtrip("[noparse][h1]字面标题[/h1][/noparse]");
  });

  it("noparse 与正常 [b] 同段对照(致命 bug 场景)", () => {
    assertStrictRoundtrip("[noparse][b]字面[/b][/noparse] vs [b]粗体[/b]");
  });

  it("noparse 内含 HTML 特殊字符", () => {
    assertStrictRoundtrip("[noparse]<html>&amp;&lt;[/noparse]");
  });

  it("noparse 不污染后续段落(噩梦 case)", () => {
    assertStrictRoundtrip(
      "[noparse][b]字面[/b][/noparse] vs [b]粗体[/b]\n\n[h1]后续标题[/h1]\n\n后续段落"
    );
  });

  it("noparse 与 [code] 共存", () => {
    assertStrictRoundtrip("[noparse][b]a[/b][/noparse]\n[code][i]b[/i][/code]");
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

// ============================================================
// 综合 fidelity master fixture - round-trip 差异报告
// 把 NASGE 改写 author 原文的所有 case 落到 work/bbcode-fidelity/round-trip-report.txt
// 这个测试不 expect 严格相等,只产出报告;后续按报告分类修 bug
// ============================================================
describe("Round-trip 差异报告 (real-fidelity-master)", () => {
  it("产出差异报告到 work/bbcode-fidelity/round-trip-report.txt", () => {
    const input = loadFixture("real-fidelity-master.bbcode.txt");
    const html = bbcodeToHtml(input);
    const output = htmlToBBCode(html);

    const dmp = new diff_match_patch();
    dmp.Diff_Timeout = 5.0;
    const diffs = dmp.diff_main(input, output);
    dmp.diff_cleanupSemantic(diffs);

    const report = buildRoundTripReport(input, output, diffs as DiffTuple[]);

    // 找 work/bbcode-fidelity 目录(__dirname 是 src/editor/utils/__tests__/)
    const repoRoot = join(__dirname, "../../../..");
    const reportDir = join(repoRoot, "work/bbcode-fidelity");
    if (!existsSync(reportDir)) {
      mkdirSync(reportDir, { recursive: true });
    }
    writeFileSync(join(reportDir, "round-trip-report.txt"), report);

    // 测试本身只验证 length 不为 0(确保函数没崩),不要求 input === output
    expect(input.length).toBeGreaterThan(0);
    expect(output.length).toBeGreaterThan(0);
  });
});

type DiffTuple = [number, string];

function buildRoundTripReport(input: string, output: string, diffs: DiffTuple[]): string {
  const lines: string[] = [];
  lines.push("=== Round-Trip Fidelity Report ===");
  lines.push(`Input  length: ${input.length} chars`);
  lines.push(`Output length: ${output.length} chars`);

  let segments: { op: number; text: string; inputIdx: number; outputIdx: number }[] = [];
  let inputIdx = 0;
  let outputIdx = 0;
  for (const [op, text] of diffs) {
    segments.push({ op, text, inputIdx, outputIdx });
    if (op !== 1) inputIdx += text.length;
    if (op !== -1) outputIdx += text.length;
  }

  // 把相邻的 (delete, insert) 合并成"修改"段;独立的 delete/insert 单独显示
  interface DiffPoint {
    inputIdx: number;
    outputIdx: number;
    deleted: string;
    inserted: string;
  }
  const points: DiffPoint[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.op === 0) continue;
    const point: DiffPoint = {
      inputIdx: seg.inputIdx,
      outputIdx: seg.outputIdx,
      deleted: "",
      inserted: "",
    };
    if (seg.op === -1) {
      point.deleted = seg.text;
      const next = segments[i + 1];
      if (next && next.op === 1) {
        point.inserted = next.text;
        i++;
      }
    } else {
      point.inserted = seg.text;
    }
    points.push(point);
  }

  lines.push(`Diff points  : ${points.length}`);
  lines.push("");

  function lineCol(s: string, idx: number): { line: number; col: number } {
    let line = 1;
    let col = 1;
    for (let i = 0; i < idx && i < s.length; i++) {
      if (s[i] === "\n") {
        line++;
        col = 1;
      } else {
        col++;
      }
    }
    return { line, col };
  }

  function ctx(s: string, idx: number, len: number): string {
    const start = Math.max(0, idx - 60);
    const end = Math.min(s.length, idx + len + 60);
    const before = s.slice(start, idx);
    const target = s.slice(idx, idx + len);
    const after = s.slice(idx + len, end);
    return JSON.stringify(before) + "  ⟪" + JSON.stringify(target) + "⟫  " + JSON.stringify(after);
  }

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const lc = lineCol(input, p.inputIdx);
    lines.push(`=== Diff #${i + 1} @ input char ${p.inputIdx} (line ${lc.line}, col ${lc.col}) ===`);
    if (p.deleted) {
      lines.push(`- Removed (was in input):`);
      lines.push(`    ${JSON.stringify(p.deleted)}`);
    }
    if (p.inserted) {
      lines.push(`+ Added (only in output):`);
      lines.push(`    ${JSON.stringify(p.inserted)}`);
    }
    lines.push(`Input  context:  ${ctx(input, p.inputIdx, p.deleted.length)}`);
    lines.push(`Output context:  ${ctx(output, p.outputIdx, p.inserted.length)}`);
    lines.push("");
  }

  if (points.length === 0) {
    lines.push("✓ 0 differences — round-trip 严格保真");
  }

  return lines.join("\n");
}
