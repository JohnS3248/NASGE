/**
 * 标题处理辅助函数
 * 用于在 JSONContent 和 字符串 之间转换
 */
import { JSONContent } from "@tiptap/core";
import { generateJSON } from "@tiptap/html";
import { createEditorExtensions } from "./editorExtensions";

/**
 * 创建空的标题 JSON
 */
export function createEmptyTitle(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: []
      }
    ]
  };
}

/**
 * 从字符串创建标题 JSON（用于数据迁移）
 * @param text 纯文本字符串
 */
export function createTitleFromText(text: string): JSONContent {
  if (!text || text.trim() === "") {
    return createEmptyTitle();
  }

  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: text
          }
        ]
      }
    ]
  };
}

/**
 * 从 HTML 创建标题 JSON（用于 Steam BBCode 解析）
 * @param html HTML 字符串
 */
export function createTitleFromHtml(html: string): JSONContent {
  if (!html || html.trim() === "") {
    return createEmptyTitle();
  }

  try {
    const extensions = createEditorExtensions();
    return generateJSON(html, extensions);
  } catch (error) {
    console.error("[titleHelpers] 从 HTML 创建标题失败", error);
    // 降级：作为纯文本处理
    const textContent = html.replace(/<[^>]*>/g, "");
    return createTitleFromText(textContent);
  }
}

/**
 * 提取标题的纯文本（用于显示和搜索）
 * @param titleJson 标题 JSON
 */
export function extractTitleText(titleJson: JSONContent): string {
  if (!titleJson || !titleJson.content) {
    return "";
  }

  const texts: string[] = [];

  function traverse(node: JSONContent) {
    if (node.type === "text" && node.text) {
      texts.push(node.text);
    }
    if (node.content && Array.isArray(node.content)) {
      node.content.forEach(traverse);
    }
  }

  traverse(titleJson);
  return texts.join("");
}

/**
 * 检查标题是否为空
 * @param titleJson 标题 JSON
 */
export function isTitleEmpty(titleJson: JSONContent): boolean {
  const text = extractTitleText(titleJson);
  return text.trim() === "";
}

/**
 * 检查标题是否包含图片
 * @param titleJson 标题 JSON
 */
export function titleHasImage(titleJson: JSONContent): boolean {
  if (!titleJson || !titleJson.content) {
    return false;
  }

  function hasImageNode(node: JSONContent): boolean {
    if (node.type === "steamImage" || node.type === "image") {
      return true;
    }
    if (node.content && Array.isArray(node.content)) {
      return node.content.some(hasImageNode);
    }
    return false;
  }

  return hasImageNode(titleJson);
}
