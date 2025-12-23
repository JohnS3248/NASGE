/**
 * 标题处理辅助函数
 * 用于在 JSONContent 和 字符串 之间转换
 */
import { JSONContent } from "@tiptap/core";
import { generateJSON } from "@tiptap/html";
import { createEditorExtensions } from "./editorExtensions";
import { useImageStore } from "../stores/useImageStore";
import { useEditorImageNodeStore } from "../stores/useEditorImageNodeStore";
import { useSteamGuideImageStore } from "../stores/useSteamGuideImageStore";
import type { ImageSizePreset, ImageAlignment } from "../types/image";

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
    console.log('[titleHelpers] 输入的 HTML:', html);
    const extensions = createEditorExtensions();
    const json = generateJSON(html, extensions);
    console.log('[titleHelpers] 生成的 JSON:', JSON.stringify(json, null, 2));

    // 遍历 JSON，查找所有 steamImage 节点并注册到 store
    registerImagesFromTitleJson(json);

    return json;
  } catch (error) {
    console.error("[titleHelpers] 从 HTML 创建标题失败", error);
    // 降级：作为纯文本处理
    const textContent = html.replace(/<[^>]*>/g, "");
    return createTitleFromText(textContent);
  }
}

/**
 * 从标题 JSON 中提取图片节点并注册到 store
 */
function registerImagesFromTitleJson(titleJson: JSONContent): void {
  const imageStore = useImageStore.getState();
  const imageNodeStore = useEditorImageNodeStore.getState();
  const steamImagePool = useSteamGuideImageStore.getState();

  function traverse(node: JSONContent) {
    if (node.type === "steamImage") {
      const previewId = node.attrs?.previewId as string | null;
      const fileName = node.attrs?.fileName as string | null;
      const sizePreset = node.attrs?.sizePreset as string | undefined;
      const alignment = node.attrs?.alignment as string | undefined;

      // 如果节点已有 imageNodeId，说明已经注册过了
      if (node.attrs?.imageNodeId) {
        return;
      }

      // 从图片池查找对应的图片
      const poolImage = previewId
        ? steamImagePool.items.find(img => img.previewId === previewId)
        : null;

      if (previewId && poolImage && poolImage.originalUrl && poolImage.thumbnailUrl) {
        // === 新 Store (主要) ===
        const imageEntity = imageStore.importFromSteamPool({
          steamPreviewId: previewId,
          fileName: fileName || poolImage.fileName || "image.png",
          originalUrl: poolImage.originalUrl,
          thumbnailUrl: poolImage.thumbnailUrl
        });

        // 更新显示设置
        imageStore.updateDisplay(imageEntity.id, {
          preset: (sizePreset as ImageSizePreset) || "original",
          alignment: (alignment as ImageAlignment) || "floatLeft"
        });

        // === 旧 Store (双写兼容) ===
        const registeredNode = imageNodeStore.registerFromSteamPool({
          previewId,
          fileName: fileName || poolImage.fileName || "image.png",
          uploadId: null,
          originalUrl: poolImage.originalUrl,
          thumbnailUrl: poolImage.thumbnailUrl
        });

        // 建立新旧 Store 关联
        imageStore.updateSourceNodeId(imageEntity.id, registeredNode.nodeId);

        // 更新节点属性以包含 imageNodeId
        node.attrs = {
          ...node.attrs,
          imageNodeId: registeredNode.nodeId,
          previewId,
          fileName: fileName || poolImage.fileName,
          sizePreset: sizePreset || "original",
          alignment: alignment || "floatLeft"
        };

        // 设置旧 Store 显示属性
        imageNodeStore.updateDisplay(registeredNode.nodeId, {
          preset: (sizePreset as any) || "original",
          alignment: (alignment as any) || "floatLeft"
        });

        console.log('[titleHelpers] 注册标题图片节点 (双写):', {
          newStoreId: imageEntity.id,
          oldStoreNodeId: registeredNode.nodeId,
          previewId,
          fileName: fileName || poolImage.fileName
        });
      } else {
        console.warn('[titleHelpers] 无法注册标题图片：previewId 为空或图片池中未找到', {
          previewId,
          fileName
        });
      }
    }

    // 递归处理子节点
    if (node.content && Array.isArray(node.content)) {
      node.content.forEach(traverse);
    }
  }

  traverse(titleJson);
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
