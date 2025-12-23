/**
 * 图片上传服务
 * 处理单张图片上传到 Steam 并获取预览码
 */

import { useEditorImageNodeStore } from "../stores/useEditorImageNodeStore";
import { useSteamGuideImageStore } from "../stores/useSteamGuideImageStore";
import { uploadImageViaSteam } from "./imageUploadManager";

/**
 * 上传单张图片到 Steam
 * @param imageNodeId 图片节点 ID
 * @returns 上传成功后的预览码
 */
export async function uploadSingleImage(imageNodeId: string): Promise<string> {
  const imageNode = useEditorImageNodeStore.getState().nodes[imageNodeId];

  if (!imageNode) {
    throw new Error("图片节点不存在");
  }

  // 如果已经有预览码，直接返回
  if (imageNode.previewId) {
    console.log('[NASGE] 图片已上传，预览码:', imageNode.previewId);
    return imageNode.previewId;
  }

  // 更新状态为上传中
  useEditorImageNodeStore.getState().markUploading(imageNodeId);
  if (imageNode.fileName) {
    useSteamGuideImageStore.getState().setImageState(imageNode.fileName, "uploading");
  }

  try {
    console.log('[NASGE] uploadSingleImage 开始上传图片:', imageNode.originalName);

    // 1. 获取图片的 Data URL（本地预览数据）
    const localPreviewDataUrl = imageNode.metadata.previewDataUrl;
    if (!localPreviewDataUrl) {
      throw new Error("图片预览数据不存在，无法上传。请重新添加图片后再试。");
    }

    // 2. 将 Data URL 转换为 File 对象
    const imageFileName = imageNode.fileName || imageNode.originalName;
    const reconstructedFile = await convertDataUrlToFile(localPreviewDataUrl, imageFileName);

    console.log('[NASGE] uploadSingleImage 已重建 File 对象:', {
      name: reconstructedFile.name,
      size: reconstructedFile.size,
      type: reconstructedFile.type
    });

    // 3. 调用真实的 Steam 上传 API
    const uploadResponse = await uploadImageViaSteam(
      reconstructedFile,
      "chapter-preview",
      { source: imageNode.metadata.source },
      {
        onPrepared: (uploadRecord) => {
          useEditorImageNodeStore.getState().attachUploadRecord(imageNodeId, uploadRecord);
        },
        onUploading: () => {
          // 状态已在函数开始时设置为 uploading，这里可以做额外处理
          console.log('[NASGE] uploadSingleImage Steam 正在处理上传...');
        },
        onUploaded: (uploadRecord, uploadResult) => {
          useEditorImageNodeStore.getState().markUploaded(imageNodeId, {
            record: uploadRecord,
            result: uploadResult
          });
          // 刷新图片池
          useSteamGuideImageStore.getState().refresh();
        },
        onFailed: (_, failureMessage) => {
          useEditorImageNodeStore.getState().markFailed(imageNodeId, failureMessage);
        }
      }
    );

    // 4. 提取真实的 previewId
    const steamPreviewId = uploadResponse.result.previewIds[0];
    if (!steamPreviewId) {
      throw new Error("Steam 上传成功但未返回 previewId");
    }

    console.log('[NASGE] uploadSingleImage 上传成功，真实预览码:', steamPreviewId);

    return steamPreviewId;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[NASGE] 图片上传失败:', errorMessage);

    // 更新状态为错误
    useEditorImageNodeStore.getState().markFailed(imageNodeId, errorMessage);
    if (imageNode.fileName) {
      useSteamGuideImageStore.getState().setImageState(imageNode.fileName, "error", errorMessage);
    }

    throw error;
  }
}

/**
 * 批量上传多张图片
 * @param imageNodeIds 图片节点 ID 列表
 * @returns 上传结果（成功的预览码列表和失败的错误信息）
 */
export async function uploadMultipleImages(imageNodeIds: string[]): Promise<{
  success: Array<{ imageNodeId: string; previewId: string }>;
  failed: Array<{ imageNodeId: string; error: string }>;
}> {
  const success: Array<{ imageNodeId: string; previewId: string }> = [];
  const failed: Array<{ imageNodeId: string; error: string }> = [];

  console.log(`[NASGE] 开始批量上传 ${imageNodeIds.length} 张图片`);

  // 并发上传（最多 3 张图片同时上传）
  const CONCURRENT_LIMIT = 3;
  const chunks: string[][] = [];

  for (let i = 0; i < imageNodeIds.length; i += CONCURRENT_LIMIT) {
    chunks.push(imageNodeIds.slice(i, i + CONCURRENT_LIMIT));
  }

  for (const chunk of chunks) {
    const promises = chunk.map(async (imageNodeId) => {
      try {
        const previewId = await uploadSingleImage(imageNodeId);
        success.push({ imageNodeId, previewId });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        failed.push({ imageNodeId, error: errorMessage });
      }
    });

    await Promise.all(promises);
  }

  console.log(`[NASGE] 批量上传完成: 成功 ${success.length} 张，失败 ${failed.length} 张`);

  return { success, failed };
}

/**
 * 将 Data URL 转换为 File 对象
 * @param dataUrl - base64 编码的 data URL (如 "data:image/png;base64,...")
 * @param originalFileName - 原始文件名，用于创建 File 对象
 * @returns File 对象
 */
async function convertDataUrlToFile(dataUrl: string, originalFileName: string): Promise<File> {
  const response = await fetch(dataUrl);
  const blobData = await response.blob();

  // 从 data URL 中提取 MIME 类型，如果失败则使用 blob 的类型
  const mimeTypeMatch = dataUrl.match(/^data:([^;,]+)/);
  const mimeType = mimeTypeMatch?.[1] || blobData.type || "image/png";

  return new File([blobData], originalFileName, {
    type: mimeType,
    lastModified: Date.now()
  });
}
