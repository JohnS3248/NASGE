/**
 * 图片上传服务
 * 处理单张图片上传到 Steam 并获取预览码
 */

import { useEditorImageNodeStore } from "../stores/useEditorImageNodeStore";
import { useSteamGuideImageStore } from "../stores/useSteamGuideImageStore";

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
    // TODO: 实现实际的上传逻辑
    // 目前先模拟上传，返回一个模拟的预览码
    console.log('[NASGE] 开始上传图片:', imageNode.fileName);

    // 模拟上传延迟
    await new Promise(resolve => setTimeout(resolve, 1500));

    // TODO: 调用实际的上传 API
    // 目前使用模拟数据，未来需要集成 uploadImageViaSteam 函数

    // 模拟生成预览码
    const mockPreviewId = `${Date.now()}`;

    // 创建符合类型的模拟上传结果
    // 注意：previewIds 留空，避免设置无效的 cdnUrl，保持本地预览
    const mockUploadResult = {
      redirectUrl: `https://steamcommunity.com/sharedfiles/filedetails/?id=${mockPreviewId}`,
      previewIds: [], // 空数组：不设置 cdnUrl，继续使用本地 blob URL 预览
      status: 1
    };

    // 创建一个 File 对象（用于满足 ImageUploadRecord 类型）
    const mockFile = new File([], imageNode.fileName || imageNode.originalName);

    // 创建符合类型的模拟上传记录
    const mockRecord = {
      id: `upload_${mockPreviewId}`,
      scope: "chapter-preview" as const,
      originalName: imageNode.originalName,
      generatedName: imageNode.fileName || imageNode.originalName,
      file: mockFile,
      status: "uploaded" as const,
      previewIds: [], // 空数组
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // 更新图片节点状态为已上传
    // 由于 previewIds 为空，不会设置 cdnUrl，图片继续使用本地预览
    useEditorImageNodeStore.getState().markUploaded(imageNodeId, {
      record: mockRecord,
      result: mockUploadResult
    });

    // 手动设置 previewId（用于 BBCode 导出）
    // 注意：这里单独设置 previewId，但不影响 cdnUrl（因为上面的 markUploaded 没有设置）
    const store = useEditorImageNodeStore.getState();
    const nodes = store.nodes;
    const updatedNode = nodes[imageNodeId];
    if (updatedNode) {
      // 直接更新节点，只添加 previewId，不清除 previewDataUrl
      useEditorImageNodeStore.setState({
        nodes: {
          ...nodes,
          [imageNodeId]: {
            ...updatedNode,
            previewId: mockPreviewId
          }
        }
      });
    }

    // 更新图片池状态
    if (imageNode.fileName) {
      useSteamGuideImageStore.getState().setPreviewId(imageNode.fileName, mockPreviewId);
    }

    console.log('[NASGE] 图片上传成功，预览码:', mockPreviewId);

    return mockPreviewId;
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
