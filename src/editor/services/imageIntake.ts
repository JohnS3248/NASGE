import type { Editor } from "@tiptap/react";
import type { ImageSource } from "../types/image";
import { ImageUploadService } from "./ImageUploadService";
import { useImageStore } from "../stores/useImageStore";
import { useEditorConfigStore } from "../stores/useEditorConfigStore";
import { loggers } from "../../shared/logger";

export type IncomingImageOptions = {
  source: "paste" | "drop";
  cursorPosition?: number;
};

export async function processIncomingImages(
  editor: Editor,
  files: File[],
  options: IncomingImageOptions
): Promise<void> {
  if (!files.length) {
    return;
  }

  if (typeof options.cursorPosition === "number") {
    editor
      .chain()
      .focus()
      .setTextSelection(options.cursorPosition)
      .run();
  } else {
    editor.commands.focus();
  }

  loggers.image.info(
    "processIncomingImages 捕获到文件",
    files.map((file) => ({
      name: file.name,
      size: file.size,
      type: file.type
    }))
  );

  const imageStore = useImageStore.getState();

  for (const file of files) {
    let previewDataUrl: string | undefined;
    let intrinsicSize:
      | {
          width: number;
          height: number;
        }
      | undefined;
    try {
      previewDataUrl = await readFileAsDataUrl(file);
      if (previewDataUrl) {
        intrinsicSize = await measureImageSize(previewDataUrl);
      }
    } catch (error) {
      loggers.image.warn("读取本地预览失败", error);
    }

    const imageEntity = imageStore.addLocalImage({
      fileName: file.name,
      originalName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      source: options.source as ImageSource,
      localPreviewUrl: previewDataUrl,
      dimensions: intrinsicSize
    });

    const inserted = editor
      .chain()
      .focus()
      .insertSteamImage({
        imageNodeId: imageEntity.id,
        previewDataUrl
      })
      .run();

    if (!inserted) {
      loggers.image.warn(
        "processIncomingImages 插入图片节点失败",
        imageEntity.id
      );
      imageStore.removeImage(imageEntity.id);
      continue;
    }

    // 检查是否应该自动上传
    const config = useEditorConfigStore.getState();
    const shouldAutoUpload =
      (options.source === "paste" && config.autoUploadOnPaste) ||
      (options.source === "drop" && config.autoUploadOnDrop);

    if (!shouldAutoUpload) {
      loggers.image.info(
        "自动上传已禁用，图片保持本地预览状态",
        {
          source: options.source,
          fileName: file.name,
          imageId: imageEntity.id
        }
      );
      continue;
    }

    // 自动上传到 Steam
    try {
      const result = await ImageUploadService.uploadByImageId(imageEntity.id);
      if (!result.success) {
        loggers.image.error("图片自动上传失败:", result.error);
      }
    } catch (error) {
      loggers.image.error("图片上传异常:", error);
    }
  }
}

async function readFileAsDataUrl(file: File): Promise<string | undefined> {
  if (typeof FileReader === "undefined") {
    return undefined;
  }

  return new Promise<string | undefined>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : undefined);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function measureImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight
      });
    };
    image.onerror = (error) => reject(error);
    image.src = dataUrl;
  });
}
