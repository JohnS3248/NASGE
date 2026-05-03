/**
 * wholeGuideSlice — A4 全篇模式的核心序列化器
 *
 * 把单个 ProseMirror doc 按 chapterTitle 节点切分为 N 章 BBCode + 元数据；
 * 反向也支持把 N 章拼接成单个 doc（用于拉取阶段反序列化）。
 *
 * BBCode 边界（W-Q11）：调用 bbcode.ts 的 `htmlToBBCode` / `bbcodeToHtml`，
 * 不做任何 BBCode 规范化（保留作者意图）。
 *
 * R9：所有 chapterTitle 文本 + 序列化后的 BBCode 均经过 sanitizeText（去 NUL 字节）。
 *
 * SPEC: 1_架构与数据模型.md §1.3 / 2_关键流程.md §2.1 §2.2
 */

import { generateHTML, generateJSON } from "@tiptap/html";
import type { Extensions, JSONContent } from "@tiptap/core";
import { bbcodeToHtml, htmlToBBCode } from "./bbcode";
import { createEditorExtensions } from "./editorExtensions";
import { CHAPTER_TITLE_MAX_CHARS } from "../extensions/chapterTitle";
import { loggers } from "../../shared/logger";

/** 章节正文 BBCode 上限（与 Steam 接受的章节正文长度一致） */
export const CHAPTER_BODY_MAX_CHARS = 8000;

export type SliceWarningType =
  | "body-overflow"
  | "title-overflow"
  | "empty-chapter"
  | "duplicate-title";

export interface SliceWarning {
  chapterIndex: number;
  type: SliceWarningType;
  detail: string;
}

export interface ChapterSlice {
  /** sectionId（从 existingChapters 按 title 完全相等回填，否则 null = 新增） */
  sectionId: string | null;
  /** 已 sanitize + 截断的章节标题（≤ 96 字符） */
  title: string;
  /** 章节正文 BBCode（已 sanitize） */
  bbcode: string;
  /** 内容快速校验码（M1 用 sync FNV-1a，M3 如需字符级 diff 可升级） */
  contentHash: string;
}

export interface SliceResult {
  chapters: ChapterSlice[];
  warnings: SliceWarning[];
}

export interface ExistingChapterRef {
  sectionId: string;
  title: string;
}

/**
 * 去除 NUL 字节（R9 解法）。
 * BBCode 转 HTML 时使用 \x00 占位符防止 [code] 块内部 BBCode 误转，
 * 因此用户原始输入若含 \x00 会与占位符碰撞 —— 在序列化前后均做 sanitize。
 */
export function sanitizeText(text: string): string {
  return typeof text === "string" ? text.replace(/\x00/g, "") : "";
}

/**
 * 同步 32-bit FNV-1a 哈希。
 *
 * SPEC §1.3.1 备注 contentHash 用于 "字符级 diff"，但 diff-match-patch 直接对 bbcode
 * 字符串操作，hash 实际只用于 dirty / 变更快速比对。M1 选用 sync FNV-1a 以保持
 * sliceDocByChapterTitle 同步签名；M3 如确需 SHA-256 可在 push 阶段异步计算。
 */
function syncHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** 缓存 wholeMode 扩展（避免每次切片重新构造） */
let cachedWholeExtensions: Extensions | null = null;
function getWholeExtensions(): Extensions {
  if (!cachedWholeExtensions) {
    cachedWholeExtensions = createEditorExtensions({ wholeMode: true });
  }
  return cachedWholeExtensions;
}

/**
 * 从 chapterTitle 节点 JSON 读取标题纯文本（用于长度检查 + 重复检测 + dialog 显示）
 * 仅取 text 子节点的 text 字段，忽略 marks（这部分由 chapterTitleNodeToBbcode 单独处理）
 */
function readChapterTitlePlainText(node: JSONContent): string {
  if (!Array.isArray(node.content)) return "";
  return node.content
    .map((c) => (c.type === "text" ? c.text ?? "" : ""))
    .join("");
}

/**
 * 把 chapterTitle 节点序列化为 BBCode（保留 marks，与 Steam 章节标题 1:1）
 *
 * 流程：把 content 包装成 paragraph → generateHTML → 提取 <p> innerHTML → htmlToBBCode
 * 容错：序列化失败时降级为纯文本
 */
function chapterTitleNodeToBbcode(node: JSONContent): string {
  if (!Array.isArray(node.content) || node.content.length === 0) return "";

  try {
    const wrapDoc: JSONContent = {
      type: "doc",
      content: [{ type: "paragraph", content: node.content }],
    };
    const html = generateHTML(wrapDoc, getWholeExtensions());

    if (typeof document === "undefined") {
      return readChapterTitlePlainText(node);
    }
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    const p = tmp.querySelector("p");
    const innerHtml = p ? p.innerHTML : tmp.innerHTML;
    return htmlToBBCode(innerHtml);
  } catch (err) {
    loggers.editor.warn("chapterTitleNodeToBbcode 序列化失败，降级为纯文本", err);
    return readChapterTitlePlainText(node);
  }
}

/**
 * 把章节标题 BBCode 反向解析为 chapterTitle 节点的 inline content（保留 marks）
 *
 * 流程：bbcodeToHtml → generateJSON → 收集所有 text 节点（含 marks），丢弃 block wrapping
 * 容错：解析失败时降级为单个 plain text 节点
 */
function bbcodeTitleToInlineContent(bbcode: string): JSONContent[] {
  if (!bbcode) return [];

  try {
    const html = bbcodeToHtml(bbcode);
    const json = generateJSON(html, getWholeExtensions()) as JSONContent;

    const inline: JSONContent[] = [];
    const collect = (n: JSONContent) => {
      if (n.type === "text" && typeof n.text === "string" && n.text.length > 0) {
        inline.push({ ...n });
      } else if (Array.isArray(n.content)) {
        n.content.forEach(collect);
      }
    };
    collect(json);
    return inline.length > 0 ? inline : [{ type: "text", text: bbcode }];
  } catch (err) {
    loggers.editor.warn("bbcodeTitleToInlineContent 解析失败，降级为纯文本", err);
    return [{ type: "text", text: bbcode }];
  }
}

/**
 * 把 doc 切分为 N 章 BBCode + 元数据
 *
 * 算法：
 *   1. 顺序扫描 doc.content 的顶层节点
 *   2. 每个 chapterTitle 节点 = 新章节起点
 *   3. 两个 chapterTitle 之间的所有非 chapterTitle 节点 = 该章正文
 *   4. 第一个 chapterTitle 之前的内容（罕见）会被忽略并 log warning
 *
 * 警告（不阻断切片）：
 *   - title-overflow：原始标题 > 96 字符
 *   - body-overflow：序列化后正文 > 8000 字符
 *   - empty-chapter：正文为空
 *   - duplicate-title：与之前章节同名
 *
 * @param doc 整篇编辑器 JSONContent
 * @param existingChapters 上次拉取的章节列表（用于按 title 完全相等回填 sectionId）
 */
export function sliceDocByChapterTitle(
  doc: JSONContent,
  existingChapters: ExistingChapterRef[] = []
): SliceResult {
  const chapters: ChapterSlice[] = [];
  const warnings: SliceWarning[] = [];

  if (!doc?.content || !Array.isArray(doc.content) || doc.content.length === 0) {
    return { chapters, warnings };
  }

  // 用 plain text 做去重 / 长度检查；用 BBCode 作为 ChapterSlice.title 输出
  const seenTitlesPlain = new Map<string, number>();
  let currentTitleNode: JSONContent | null = null;
  let currentBody: JSONContent[] = [];

  const flushChapter = () => {
    if (currentTitleNode === null) return;
    const idx = chapters.length;
    const plainText = sanitizeText(readChapterTitlePlainText(currentTitleNode));
    const titleBbcode = sanitizeText(chapterTitleNodeToBbcode(currentTitleNode));

    if (plainText.length > CHAPTER_TITLE_MAX_CHARS) {
      warnings.push({
        chapterIndex: idx,
        type: "title-overflow",
        detail: `章节 ${idx + 1} 标题 ${plainText.length} 字符超过 ${CHAPTER_TITLE_MAX_CHARS} 限制（请在编辑器内截短）`,
      });
    }

    let bbcode = "";
    if (currentBody.length > 0) {
      try {
        const bodyDoc: JSONContent = { type: "doc", content: currentBody };
        const html = generateHTML(bodyDoc, getWholeExtensions());
        bbcode = sanitizeText(htmlToBBCode(html));
      } catch (err) {
        loggers.editor.error("sliceDocByChapterTitle: 序列化章节正文失败", {
          chapterIndex: idx,
          err,
        });
        bbcode = "";
      }
    }

    if (bbcode.length === 0) {
      warnings.push({
        chapterIndex: idx,
        type: "empty-chapter",
        detail: `章节 ${idx + 1}「${plainText}」正文为空`,
      });
    }
    if (bbcode.length > CHAPTER_BODY_MAX_CHARS) {
      warnings.push({
        chapterIndex: idx,
        type: "body-overflow",
        detail: `章节 ${idx + 1}「${plainText}」正文 ${bbcode.length} 字符超过 ${CHAPTER_BODY_MAX_CHARS} 限制`,
      });
    }
    if (seenTitlesPlain.has(plainText)) {
      warnings.push({
        chapterIndex: idx,
        type: "duplicate-title",
        detail: `章节 ${idx + 1}「${plainText}」与第 ${(seenTitlesPlain.get(plainText) ?? -1) + 1} 章标题重复`,
      });
    } else {
      seenTitlesPlain.set(plainText, idx);
    }

    // sectionId 回填：先按 BBCode 完全相等匹配（含 marks），再退而求其次按 plain text 匹配
    const matched =
      existingChapters.find((c) => c.title === titleBbcode) ??
      existingChapters.find((c) => sanitizeText(c.title) === plainText);
    const sectionId = matched ? matched.sectionId : null;

    chapters.push({
      sectionId,
      title: titleBbcode,
      bbcode,
      contentHash: syncHash(bbcode),
    });

    currentTitleNode = null;
    currentBody = [];
  };

  for (const node of doc.content) {
    if (node.type === "chapterTitle") {
      flushChapter();
      currentTitleNode = node;
    } else {
      if (currentTitleNode === null) {
        loggers.editor.warn(
          "sliceDocByChapterTitle: 首个 chapterTitle 之前的节点被忽略",
          { nodeType: node.type }
        );
        continue;
      }
      currentBody.push(node);
    }
  }

  flushChapter();

  return { chapters, warnings };
}

/**
 * 把 N 章 BBCode + title 反向拼接为单 doc（用于拉取阶段构造编辑器初始 doc）
 *
 * 步骤：
 *   1. 每章先放一个 chapterTitle 节点（含 sanitized title 文本）
 *   2. bbcodeToHtml(bbcode) → HTML → generateJSON 解析为 TipTap node 数组
 *   3. 把节点 append 到 doc.content
 *
 * 容错：单章 bbcode 解析失败时降级为纯 paragraph 保留原始内容。
 */
export function buildDocFromChapters(
  chapters: { sectionId?: string | null; title: string; bbcode: string }[]
): JSONContent {
  const docNodes: JSONContent[] = [];

  for (const c of chapters) {
    const safeTitleBbcode = sanitizeText(c.title);
    // 解析 BBCode 标题为含 marks 的 inline 节点（[b]xxx[/b] → text + bold mark）
    const titleContent = bbcodeTitleToInlineContent(safeTitleBbcode);
    docNodes.push({
      type: "chapterTitle",
      content: titleContent.length > 0 ? titleContent : undefined,
    });

    if (c.bbcode && c.bbcode.length > 0) {
      try {
        const html = bbcodeToHtml(c.bbcode);
        const json = generateJSON(html, getWholeExtensions()) as JSONContent;
        if (Array.isArray(json.content)) {
          docNodes.push(...json.content);
        }
      } catch (err) {
        loggers.editor.error("buildDocFromChapters: 反序列化章节失败，降级为段落", {
          title: safeTitleBbcode,
          err,
        });
        docNodes.push({
          type: "paragraph",
          content: [{ type: "text", text: c.bbcode }],
        });
      }
    }
  }

  return {
    type: "doc",
    content: docNodes,
  };
}

/** 计数 doc 顶层 chapterTitle 节点数 */
export function countChapters(doc: JSONContent): number {
  if (!doc?.content || !Array.isArray(doc.content)) return 0;
  return doc.content.filter((n) => n.type === "chapterTitle").length;
}

/**
 * 给定 PM 位置，返回该位置所在章节 index（0-based，第一个 chapterTitle 之前 → -1）
 *
 * 注：位置语义按 ProseMirror flat token 模型估算（block 节点开/闭各占 1 token）。
 * M1 调用方为单元测试 + future TOC scroll-spy（M2），精度足够。
 */
export function findChapterIndexAtPos(doc: JSONContent, pos: number): number {
  if (!doc?.content || !Array.isArray(doc.content)) return -1;

  let cursor = 0;
  let chapterIndex = -1;

  for (const node of doc.content) {
    const nodeSize = estimateNodeSize(node);
    const nodeStart = cursor;
    const nodeEnd = cursor + nodeSize;

    if (node.type === "chapterTitle") {
      chapterIndex++;
    }

    if (pos >= nodeStart && pos < nodeEnd) {
      return chapterIndex;
    }

    cursor = nodeEnd;
  }

  return chapterIndex;
}

/**
 * 估算 JSONContent 节点占的 ProseMirror 位置数（近似）
 * - text 节点：text.length
 * - 其他节点：2（开/闭）+ 内部 size
 */
function estimateNodeSize(node: JSONContent): number {
  if (node.type === "text") {
    return (node.text ?? "").length;
  }
  let inner = 0;
  if (Array.isArray(node.content)) {
    for (const c of node.content) {
      inner += estimateNodeSize(c);
    }
  }
  return 2 + inner;
}
