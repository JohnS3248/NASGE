/**
 * 字符数限制工具函数
 * 用于计算编辑器内容转换为 BBCode 后的字符数
 */
import { Editor } from "@tiptap/core";
import { htmlToBBCode } from "./bbcode";
import { WARNING_THRESHOLD_PERCENT } from "../constants/limits";
import { loggers } from "../../shared/logger";

export type CharacterLimitInfo = {
  /** 当前 BBCode 字符数 */
  length: number;
  /** 剩余可用字符数 */
  remaining: number;
  /** 是否超出限制 */
  exceeded: boolean;
  /** 是否接近限制（超过警告阈值） */
  warning: boolean;
  /** 字符限制 */
  limit: number;
};

/**
 * 计算编辑器内容的 BBCode 字符数
 * @param editor TipTap 编辑器实例
 * @returns BBCode 字符数
 */
export function getBBCodeLength(editor: Editor | null): number {
  if (!editor) return 0;

  try {
    const html = editor.getHTML();
    const bbcode = htmlToBBCode(html);
    return bbcode.length;
  } catch (error) {
    loggers.editor.error('计算 BBCode 长度失败:', error);
    return 0;
  }
}

/**
 * 检查字符数是否超出限制
 * @param editor TipTap 编辑器实例
 * @param limit 字符数限制
 * @returns 字符限制信息
 */
export function checkCharacterLimit(
  editor: Editor | null,
  limit: number
): CharacterLimitInfo {
  const length = getBBCodeLength(editor);
  const remaining = limit - length;
  const exceeded = length > limit;
  const warning = !exceeded && length >= limit * WARNING_THRESHOLD_PERCENT;

  return {
    length,
    remaining,
    exceeded,
    warning,
    limit
  };
}

/**
 * 获取字符数显示的颜色样式
 * @param info 字符限制信息
 * @returns CSS 颜色值
 */
export function getCharacterCountColor(info: CharacterLimitInfo): string {
  if (info.exceeded) {
    return '#ef4444'; // 红色 - 超出限制
  } else if (info.warning) {
    return '#f59e0b'; // 橙色 - 接近限制
  } else {
    return '#6b7280'; // 灰色 - 正常
  }
}

/**
 * 获取字符数显示文本
 * @param info 字符限制信息
 * @returns 显示文本，例如 "45 / 96" 或 "98 / 96 ⚠️"
 */
export function getCharacterCountText(info: CharacterLimitInfo): string {
  const baseText = `${info.length} / ${info.limit}`;
  return info.exceeded ? `${baseText} ⚠️` : baseText;
}
