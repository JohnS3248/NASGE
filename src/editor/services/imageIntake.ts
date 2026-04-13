import type { Editor } from "@tiptap/react";
import type { ImageSource } from "../types/image";
import { useImageStore } from "../stores/useImageStore";
import { useGuideStore, isOnlineMode } from "../stores/useGuideStore";
import { loggers } from "../../shared/logger";
import { toast } from "../stores/useToastStore";
import i18n from "i18next";

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

  // 离线模式下图片无法上传到 Steam，提前拦截
  const mode = useGuideStore.getState().mode;
  if (!isOnlineMode(mode)) {
    toast.warning(i18n.t("image.offlineBlocked", { ns: "editor" }));
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
