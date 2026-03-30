/**
 * 从 useImageStore 获取图片实体
 * 支持多种 ID 查找：imageEntity.id、sourceNodeId、steamPreviewId
 */
import { useImageStore } from "../stores/useImageStore";
import type { ImageEntity } from "../types/image";

export function useImageFromStore(
  imageNodeId: string | null,
  previewId: string | null
): ImageEntity | undefined {
  return useImageStore((state) => {
    if (imageNodeId) {
      const byId = state.getImageById(imageNodeId);
      if (byId) return byId;
      const bySourceNodeId = state.getImageBySourceNodeId(imageNodeId);
      if (bySourceNodeId) return bySourceNodeId;
    }
    if (previewId) {
      const byPreviewId = state.getImageBySteamPreviewId(previewId);
      if (byPreviewId) return byPreviewId;
    }
    return undefined;
  });
}
