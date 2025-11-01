import type { ImageUploadMetadata, ImageUploadSource } from "../stores/useImageUploadStore";
import { uploadImageViaSteam } from "./imageUploadManager";

export type IncomingImageOptions = {
  source: ImageUploadSource;
  cursorPosition?: number;
};

export async function processIncomingImages(
  files: File[],
  options: IncomingImageOptions
): Promise<void> {
  if (!files.length) {
    return;
  }

  const metadata: ImageUploadMetadata = {
    source: options.source,
    cursorPosition: options.cursorPosition
  };

  console.info("[NASGE] processIncomingImages -> 捕获到文件", files.map((file) => ({
    name: file.name,
    size: file.size,
    type: file.type
  })));

  // 并行上传，后续可根据需要改成队列
  for (const file of files) {
    try {
      await uploadImageViaSteam(file, "chapter-preview", metadata);
    } catch (error) {
      console.error("[NASGE] 图片上传失败:", error);
      throw error;
    }
  }
}
