import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Mock useSteamGuideImageStore — bbcode.ts 用它查图片 URL，roundtrip 测试不需要实际 URL
vi.mock("../../stores/useSteamGuideImageStore", () => ({
  useSteamGuideImageStore: {
    getState: () => ({ items: [] })
  }
}));

// Mock logger
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

/**
 * 把 HTML 字符串规范化为 DOM 等价的最小形式：
 * 1. 通过 HTML5 parser 解析 → 重新序列化（折叠 attribute 顺序、自闭合形式等差异）
 * 2. 移除 table/tbody/thead/tfoot/tr 直接子节点中的纯空白文本节点
 *    （这些空白节点在浏览器渲染时不可见，但 jsdom 不会自动剔除）
 *
 * 用途：让 fixture 测试比较"渲染结果"而非"字符串文本"，允许 BBCode 排版差异
 * （如 `[/td]\n[/tr]` vs `[/td][/tr]`）通过测试。
 */
function canonicalizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(
    `<!doctype html><html><body>${html}</body></html>`,
    "text/html"
  );
  const tableContainers = doc.body.querySelectorAll(
    "table, tbody, thead, tfoot, tr"
  );
  for (const el of tableContainers) {
    const toRemove: ChildNode[] = [];
    el.childNodes.forEach((child) => {
      if (child.nodeType === 3 /* TEXT_NODE */ && /^\s*$/.test(child.textContent ?? "")) {
        toRemove.push(child as ChildNode);
      }
    });
    for (const node of toRemove) node.remove();
  }
  return doc.body.innerHTML;
}

/**
 * 端到端 fixture 测试 — **DOM 等价 + 幂等性验证**
 *
 * 与 bbcodeRoundtrip.test.ts 的细粒度单测互补：
 * - 单测：每个特性的字符级保真（小输入 → 严格相等）
 * - fixture：大文章是否能稳定收敛到规范形式（converter 不会"震荡"或丢信息）
 *
 * 为什么不做 BBCode 字符级比较？fixture 文件常用人类排版（如 `[/tr]` 独占一行），
 * 而 converter 收敛到规范形式（`[td]X[/td][/tr]`）。两者 Steam 渲染相同，
 * 只是不同的"等价类代表"。字符级比较会把这种风格差异误报为 bug。
 *
 * 检查策略：
 * 1. **DOM 等价性**：bbcodeToHtml(input) 与 bbcodeToHtml(roundtrip(input)) 经过
 *    HTML5 parser 规范化后必须相同 — 证明 BBCode 规范化不改变最终渲染。
 * 2. **BBCode 幂等性**：第二次往返结果必须与第一次完全相同 — 证明 converter
 *    收敛到规范形式，不会持续震荡。
 *
 * 这套测试同时也是 crash test：验证 converter 在真实大文本上不会抛异常。
 */
function testFixtureRoundtrip(input: string, label: string) {
  // 第一次往返：原始 → 规范形式
  const html1 = bbcodeToHtml(input);
  const output1 = htmlToBBCode(html1);

  // 第二次往返：规范形式 → 应保持不变
  const html2 = bbcodeToHtml(output1);
  const output2 = htmlToBBCode(html2);

  // 检查 1: DOM 等价性 — 两次 HTML 经 HTML5 parser 规范化后相同
  const canonicalHtml1 = canonicalizeHtml(html1);
  const canonicalHtml2 = canonicalizeHtml(html2);
  if (canonicalHtml1 !== canonicalHtml2) {
    const diffAt = firstDiffIndex(canonicalHtml1, canonicalHtml2);
    console.error(`\n--- ${label} DOM 不一致 @ ${diffAt} ---`);
    console.error("DOM1 片段:", JSON.stringify(canonicalHtml1.slice(Math.max(0, diffAt - 80), diffAt + 80)));
    console.error("DOM2 片段:", JSON.stringify(canonicalHtml2.slice(Math.max(0, diffAt - 80), diffAt + 80)));
  }
  expect(canonicalHtml2).toBe(canonicalHtml1);

  // 检查 2: BBCode 幂等性
  if (output1 !== output2) {
    const diffAt = firstDiffIndex(output1, output2);
    console.error(`\n--- ${label} BBCode 非幂等 @ ${diffAt} ---`);
    console.error("OUT1 片段:", JSON.stringify(output1.slice(Math.max(0, diffAt - 80), diffAt + 80)));
    console.error("OUT2 片段:", JSON.stringify(output2.slice(Math.max(0, diffAt - 80), diffAt + 80)));
  }
  expect(output2).toBe(output1);
}

function firstDiffIndex(a: string, b: string): number {
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) {
    if (a[i] !== b[i]) return i;
  }
  return a.length === b.length ? -1 : minLen;
}

describe("Fixture roundtrip — 端到端真实素材", () => {
  it("大测试章节（339 行综合 BBCode）", () => {
    const bbcode = loadFixture("large-chapter.bbcode.txt");
    expect(bbcode.length).toBeGreaterThan(1000);
    testFixtureRoundtrip(bbcode, "大测试章节");
  });

  it("内联图片测试", () => {
    const bbcode = loadFixture("inline-images.bbcode.txt");
    expect(bbcode.length).toBeGreaterThan(50);
    testFixtureRoundtrip(bbcode, "内联图片测试");
  });

  it("表格测试", () => {
    const bbcode = loadFixture("table-test.bbcode.txt");
    expect(bbcode.length).toBeGreaterThan(500);
    testFixtureRoundtrip(bbcode, "表格测试");
  });
});
