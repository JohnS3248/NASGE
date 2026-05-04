/**
 * wholeGuideRichDiff — 富文本层级 diff
 *
 * 不在 BBCode 字符层做 diff,而是:
 * 1. 两边 BBCode 经 bbcodeToHtml + TipTap (generateJSON/generateHTML) 标准化成 HTML
 *    标准化消除类别 1 (嵌套 inline mark 顺序) 等渲染等价但字符不等的差异
 * 2. 在 HTML 上做 token-level diff (标签 / entity / 字符为最小单位),
 *    输出带 <ins>/<del> 的合法 HTML 字符串
 * 3. UI 直接渲染该 HTML + ins/del 上色 → 视觉块级 diff
 *    (例:整个 h3 改字 → h3 仍渲染为大字号,只有改动字符上色)
 */
import { generateHTML, generateJSON } from "@tiptap/html";
import { diff_match_patch } from "diff-match-patch";
import type { Extensions } from "@tiptap/core";

import { bbcodeToHtml, htmlToBBCode } from "./bbcode";
import { createEditorExtensions } from "./editorExtensions";
import type { ChapterSlice } from "./wholeGuideSlice";

const DIFF_DELETE = -1;
const DIFF_INSERT = 1;
const DIFF_EQUAL = 0;

let _cachedExtensions: Extensions | null = null;
function getNormalizeExtensions(): Extensions {
  if (!_cachedExtensions) {
    _cachedExtensions = createEditorExtensions();
  }
  return _cachedExtensions;
}

/**
 * BBCode → 标准化 HTML
 *
 * 两步规范化,消除 NASGE 拉取/序列化引入的等价改写:
 *   1. BBCode round-trip(bbcodeToHtml → htmlToBBCode):把 author 原始 BBCode
 *      规范化到 NASGE 输出形式,例:[previewicon=...inline,sizeFull...] → [previewimg=...]
 *      (Steam 渲染等价,NASGE 序列化时统一选 previewimg)
 *   2. TipTap parse + serialize:规范化嵌套 inline mark 顺序
 *      (例:[i][b]X[/b][/i] / [b][i]X[/i][/b] 渲染等价,TipTap 按 mark priority 输出统一形式)
 *
 * 经此规范化后,author 原写法和 NASGE 重新序列化的写法在 HTML 层应严格相等,
 * diff 层只剩 author 真实改动。
 */
export function bbcodeToNormalizedHtml(bbcode: string): string {
  if (!bbcode || !bbcode.trim()) return "";
  const roundtripped = htmlToBBCode(bbcodeToHtml(bbcode));
  const rawHtml = bbcodeToHtml(roundtripped);
  try {
    const json = generateJSON(rawHtml, getNormalizeExtensions());
    return generateHTML(json, getNormalizeExtensions());
  } catch {
    return rawHtml;
  }
}

// ============================================================
// HTML token 化 + diff
// ============================================================

const TAG_RE = /^<[^>]+>/;
const ENTITY_RE = /^&[a-zA-Z#0-9]+;/;

/**
 * Tokenize HTML 为 token 数组
 * - 完整开/闭标签 (含自闭合) 作为 1 个 token
 * - HTML entity (&amp; &lt; ...) 作为 1 个 token
 * - 其他每个字符 1 个 token (中英文都按 char,粒度自然支持中文逐字 diff)
 */
function tokenize(html: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < html.length) {
    const rest = html.slice(i);
    if (html[i] === "<") {
      const m = rest.match(TAG_RE);
      if (m) {
        tokens.push(m[0]);
        i += m[0].length;
        continue;
      }
    }
    if (html[i] === "&") {
      const m = rest.match(ENTITY_RE);
      if (m) {
        tokens.push(m[0]);
        i += m[0].length;
        continue;
      }
    }
    tokens.push(html[i]);
    i++;
  }
  return tokens;
}

/**
 * Token 序列编码为 PUA 区间 unicode 字符串,供 diff-match-patch 处理
 * (PUA U+E000-U+F8FF 共 6400 个码点;实际章节远不会用满)
 */
function encodeTokens(
  tokens: string[],
  registry: Map<string, string>,
  reverse: string[]
): string {
  let s = "";
  for (const t of tokens) {
    let ch = registry.get(t);
    if (ch === undefined) {
      const code = 0xe000 + reverse.length;
      if (code > 0xf8ff) {
        // 超出 PUA 区间 → 用 token 原文 + 空格做近似 diff,粒度退化但不会崩
        s += t;
        continue;
      }
      ch = String.fromCharCode(code);
      registry.set(t, ch);
      reverse.push(t);
    }
    s += ch;
  }
  return s;
}

function decodeTokens(encoded: string, reverse: string[]): string {
  let out = "";
  for (const ch of encoded) {
    const code = ch.charCodeAt(0);
    if (code >= 0xe000 && code < 0xe000 + reverse.length) {
      out += reverse[code - 0xe000];
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * 对一段编码后的字符串,统计内含的"可见文本字符"数 (标签/entity 不计入)
 * 用于 diff stats 的 +/- 字数显示,贴近用户感知
 */
function countVisibleChars(encoded: string, reverse: string[]): number {
  let n = 0;
  for (const ch of encoded) {
    const code = ch.charCodeAt(0);
    if (code >= 0xe000 && code < 0xe000 + reverse.length) {
      const value = reverse[code - 0xe000];
      if (value && value[0] !== "<" && value[0] !== "&") {
        n += value.length;
      }
    }
  }
  return n;
}

export interface RichDiffStats {
  additions: number;
  deletions: number;
}

/**
 * 对两段 BBCode 做富文本 diff,返回带 <ins>/<del> 的 HTML 字符串
 */
export function richDiffSingleChapter(
  oldBbcode: string,
  newBbcode: string
): {
  diffHtml: string;
  hasChanges: boolean;
  stats: RichDiffStats;
} {
  const oldHtml = bbcodeToNormalizedHtml(oldBbcode);
  const newHtml = bbcodeToNormalizedHtml(newBbcode);

  if (oldHtml === newHtml) {
    return {
      diffHtml: oldHtml,
      hasChanges: false,
      stats: { additions: 0, deletions: 0 },
    };
  }

  const oldTokens = tokenize(oldHtml);
  const newTokens = tokenize(newHtml);

  const registry = new Map<string, string>();
  const reverse: string[] = [];
  const oldEncoded = encodeTokens(oldTokens, registry, reverse);
  const newEncoded = encodeTokens(newTokens, registry, reverse);

  const dmp = new diff_match_patch();
  dmp.Diff_Timeout = 1.0;
  const diffs = dmp.diff_main(oldEncoded, newEncoded);
  dmp.diff_cleanupSemantic(diffs);

  let result = "";
  let additions = 0;
  let deletions = 0;
  let hasInsertOrDelete = false;
  for (const [op, encoded] of diffs as [number, string][]) {
    const text = decodeTokens(encoded, reverse);
    if (op === DIFF_EQUAL) {
      result += text;
    } else if (op === DIFF_INSERT) {
      hasInsertOrDelete = true;
      additions += countVisibleChars(encoded, reverse);
      result += `<ins class="nasge-diff-ins">${text}</ins>`;
    } else if (op === DIFF_DELETE) {
      hasInsertOrDelete = true;
      deletions += countVisibleChars(encoded, reverse);
      result += `<del class="nasge-diff-del">${text}</del>`;
    }
  }

  return {
    diffHtml: result,
    hasChanges: hasInsertOrDelete,
    stats: { additions, deletions },
  };
}

// ============================================================
// 整篇 diff
// ============================================================

export interface RichChapterDiffResult {
  sectionId: string | null;
  title: string;
  oldBbcode: string;
  newBbcode: string;
  /** 带 <ins>/<del> 的 HTML 字符串,直接渲染 */
  diffHtml: string;
  hasChanges: boolean;
  isNew: boolean;
  isDeleted: boolean;
  stats: RichDiffStats;
}

interface OldChapterRef {
  sectionId: string;
  title: string;
  bbcode: string;
}

function countPlainText(html: string): number {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-zA-Z#0-9]+;/g, "x")
    .length;
}

export function richDiffWholeGuide(
  oldChapters: OldChapterRef[],
  newSlices: ChapterSlice[]
): RichChapterDiffResult[] {
  const results: RichChapterDiffResult[] = [];
  const usedOldIds = new Set<string>();

  for (const slice of newSlices) {
    let matched: OldChapterRef | undefined;
    if (slice.sectionId) {
      matched = oldChapters.find((c) => c.sectionId === slice.sectionId);
      if (matched) usedOldIds.add(matched.sectionId);
    }
    if (!matched) {
      const newHtml = bbcodeToNormalizedHtml(slice.bbcode);
      const diffHtml = newHtml
        ? `<ins class="nasge-diff-ins">${newHtml}</ins>`
        : "";
      const additions = countPlainText(newHtml);
      results.push({
        sectionId: slice.sectionId,
        title: slice.title,
        oldBbcode: "",
        newBbcode: slice.bbcode,
        diffHtml,
        hasChanges: additions > 0,
        isNew: true,
        isDeleted: false,
        stats: { additions, deletions: 0 },
      });
      continue;
    }

    const { diffHtml, hasChanges, stats } = richDiffSingleChapter(
      matched.bbcode,
      slice.bbcode
    );
    results.push({
      sectionId: slice.sectionId,
      title: slice.title,
      oldBbcode: matched.bbcode,
      newBbcode: slice.bbcode,
      diffHtml,
      hasChanges,
      isNew: false,
      isDeleted: false,
      stats,
    });
  }

  for (const old of oldChapters) {
    if (usedOldIds.has(old.sectionId)) continue;
    const oldHtml = bbcodeToNormalizedHtml(old.bbcode);
    const diffHtml = oldHtml
      ? `<del class="nasge-diff-del">${oldHtml}</del>`
      : "";
    const deletions = countPlainText(oldHtml);
    results.push({
      sectionId: old.sectionId,
      title: old.title,
      oldBbcode: old.bbcode,
      newBbcode: "",
      diffHtml,
      hasChanges: deletions > 0,
      isNew: false,
      isDeleted: true,
      stats: { additions: 0, deletions },
    });
  }

  return results;
}

export function aggregateRichStats(results: RichChapterDiffResult[]): {
  changedCount: number;
  totalAdditions: number;
  totalDeletions: number;
} {
  let changedCount = 0;
  let totalAdditions = 0;
  let totalDeletions = 0;
  for (const r of results) {
    if (r.hasChanges) changedCount++;
    totalAdditions += r.stats.additions;
    totalDeletions += r.stats.deletions;
  }
  return { changedCount, totalAdditions, totalDeletions };
}
