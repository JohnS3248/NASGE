/**
 * wholeGuideDiff — 字符级 diff 封装
 *
 * 基于 diff-match-patch 对每章 BBCode 做字符级 diff，输出按章节聚合的结果。
 * 章节对齐：sectionId 主匹配（已存在的章节）→ title 副匹配（重命名场景）。
 * 远程独有章节标记为已删除；本地独有标记为新增。
 */

import { diff_match_patch } from "diff-match-patch";
import type { ChapterSlice } from "./wholeGuideSlice";

export type DiffOp = "equal" | "insert" | "delete";

export interface DiffSegment {
  op: DiffOp;
  text: string;
}

export interface DiffStats {
  additions: number;
  deletions: number;
  unchanged: number;
}

export interface ChapterDiffResult {
  /** sectionId（远程独有 / 已删除时仍保留 sectionId 以备 UI 显示） */
  sectionId: string | null;
  /** 章节标题（本地优先；远程独有时用旧标题；含状态后缀） */
  title: string;
  oldBbcode: string;
  newBbcode: string;
  segments: DiffSegment[];
  /** 是否有变化（hasChanges = stats.additions > 0 || stats.deletions > 0） */
  hasChanges: boolean;
  /** 该章是否仅在本地存在（新增章节） */
  isNew: boolean;
  /** 该章是否仅在远程存在（已删除章节） */
  isDeleted: boolean;
  stats: DiffStats;
}

export interface DiffOptions {
  /** 忽略空白：diff 前对两边折叠连续空白为单空格 */
  ignoreWhitespace?: boolean;
  /** 仅保留每段 equal 周围 N 行上下文（可选；0 = 全展开） */
  contextLines?: number;
  /** 启用 diff_cleanupSemantic（合并语义相近的小段） */
  semanticCleanup?: boolean;
  /** diff_main timeout 秒（默认 1.0） */
  timeoutSec?: number;
}

const DEFAULT_OPTIONS: Required<DiffOptions> = {
  ignoreWhitespace: false,
  contextLines: 3,
  semanticCleanup: true,
  timeoutSec: 1.0,
};

const DIFF_DELETE = -1;
const DIFF_INSERT = 1;
const DIFF_EQUAL = 0;

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * 单章字符级 diff
 */
export function diffSingleChapter(
  oldBbcode: string,
  newBbcode: string,
  options: DiffOptions = {}
): DiffSegment[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const dmp = new diff_match_patch();
  dmp.Diff_Timeout = opts.timeoutSec;

  let oldText = oldBbcode;
  let newText = newBbcode;

  if (opts.ignoreWhitespace) {
    oldText = normalizeWhitespace(oldText);
    newText = normalizeWhitespace(newText);
  }

  const raw = dmp.diff_main(oldText, newText);
  if (opts.semanticCleanup) {
    dmp.diff_cleanupSemantic(raw);
  }

  return raw.map(([op, text]: [number, string]) => ({
    op:
      op === DIFF_INSERT
        ? "insert"
        : op === DIFF_DELETE
          ? "delete"
          : "equal",
    text,
  }));
}

/**
 * 计算 segment 统计
 */
export function computeStats(segments: DiffSegment[]): DiffStats {
  let additions = 0;
  let deletions = 0;
  let unchanged = 0;
  for (const seg of segments) {
    if (seg.op === "insert") additions += seg.text.length;
    else if (seg.op === "delete") deletions += seg.text.length;
    else unchanged += seg.text.length;
  }
  return { additions, deletions, unchanged };
}

/**
 * 章节折叠：保留每段 equal 段周围 contextLines 行（行 = 按 \n 切），中间长 equal 段标记为 collapsed。
 *
 * 当前实现：当 contextLines > 0 且 equal 段长度 > 2*contextLines+1 行时，截断中间。
 * UI 通过显示 segment.text 直接渲染（不需要单独标记），故仅返回截断后 segments。
 */
export function collapseEqualContext(
  segments: DiffSegment[],
  contextLines: number
): DiffSegment[] {
  if (contextLines <= 0) return segments;
  const out: DiffSegment[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.op !== "equal") {
      out.push(seg);
      continue;
    }
    const lines = seg.text.split("\n");
    const isFirst = i === 0;
    const isLast = i === segments.length - 1;
    const keep = contextLines;
    if (lines.length <= keep * 2 + 1) {
      out.push(seg);
      continue;
    }
    // 中间段：保留首 keep 行 + 末 keep 行
    if (!isFirst && !isLast) {
      const head = lines.slice(0, keep).join("\n");
      const tail = lines.slice(lines.length - keep).join("\n");
      out.push({ op: "equal", text: head + "\n" });
      out.push({ op: "equal", text: `… ${lines.length - keep * 2} 行未变 …\n` });
      out.push({ op: "equal", text: tail });
    } else if (isFirst) {
      // 首段：仅保留末 keep 行
      out.push({ op: "equal", text: `… ${lines.length - keep} 行未变 …\n` });
      out.push({ op: "equal", text: lines.slice(lines.length - keep).join("\n") });
    } else {
      // 末段：仅保留首 keep 行
      out.push({ op: "equal", text: lines.slice(0, keep).join("\n") });
      out.push({ op: "equal", text: `\n… ${lines.length - keep} 行未变 …` });
    }
  }
  return out;
}

interface OldChapterRef {
  sectionId: string;
  title: string;
  bbcode: string;
}

/**
 * 整篇 diff：按 sectionId 对齐章节，输出每章 ChapterDiffResult
 */
export function diffWholeGuide(
  oldChapters: OldChapterRef[],
  newSlices: ChapterSlice[],
  options: DiffOptions = {}
): ChapterDiffResult[] {
  const results: ChapterDiffResult[] = [];
  const usedOldIds = new Set<string>();

  // 本地切片为主线（保留章节顺序）
  for (const slice of newSlices) {
    let matched: OldChapterRef | undefined;
    if (slice.sectionId) {
      matched = oldChapters.find((c) => c.sectionId === slice.sectionId);
      if (matched) usedOldIds.add(matched.sectionId);
    }
    if (!matched) {
      // 新增章节（远程版本视作空）
      const segments: DiffSegment[] = slice.bbcode
        ? [{ op: "insert", text: slice.bbcode }]
        : [];
      const stats = computeStats(segments);
      results.push({
        sectionId: slice.sectionId,
        title: slice.title,
        oldBbcode: "",
        newBbcode: slice.bbcode,
        segments,
        hasChanges: stats.additions > 0 || stats.deletions > 0,
        isNew: true,
        isDeleted: false,
        stats,
      });
      continue;
    }

    const segments = diffSingleChapter(matched.bbcode, slice.bbcode, options);
    const stats = computeStats(segments);
    results.push({
      sectionId: slice.sectionId,
      title: slice.title,
      oldBbcode: matched.bbcode,
      newBbcode: slice.bbcode,
      segments,
      hasChanges: stats.additions > 0 || stats.deletions > 0,
      isNew: false,
      isDeleted: false,
      stats,
    });
  }

  // 远程独有章节（已删除）
  for (const old of oldChapters) {
    if (usedOldIds.has(old.sectionId)) continue;
    const segments: DiffSegment[] = old.bbcode
      ? [{ op: "delete", text: old.bbcode }]
      : [];
    const stats = computeStats(segments);
    results.push({
      sectionId: old.sectionId,
      title: old.title,
      oldBbcode: old.bbcode,
      newBbcode: "",
      segments,
      hasChanges: stats.deletions > 0,
      isNew: false,
      isDeleted: true,
      stats,
    });
  }

  return results;
}

/** 把 ChapterDiffResult[] 聚合为整体统计（用于 ReviewTab1 顶部 summary） */
export function aggregateStats(results: ChapterDiffResult[]): {
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
