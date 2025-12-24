import type { Editor } from "@tiptap/react";
import type { ImageSource } from "../types/image";
import { ImageUploadService } from "./ImageUploadService";
import { useImageStore } from "../stores/useImageStore";
import { useEditorImageNodeStore } from "../stores/useEditorImageNodeStore";
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
  const imageNodeStore = useEditorImageNodeStore.getState();

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

    // === 新 Store (主要) ===
    const imageEntity = imageStore.addLocalImage({
      fileName: file.name,
      originalName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      source: options.source as ImageSource,
      localPreviewUrl: previewDataUrl,
      dimensions: intrinsicSize
    });

    // === 旧 Store (双写兼容) ===
    const node = imageNodeStore.registerFromLocalFile({
      file,
      metadata: {
        source: options.source,
        cursorPosition: options.cursorPosition
      },
      previewDataUrl,
      intrinsicSize
    });

    // 建立新旧 Store 之间的关联
    imageStore.updateSourceNodeId(imageEntity.id, node.nodeId);

    loggers.image.verbose("imageIntake 双写完成", {
      newStoreId: imageEntity.id,
      oldStoreNodeId: node.nodeId
    });

    const inserted = editor
      .chain()
      .focus()
      .insertSteamImage({
        imageNodeId: node.nodeId, // 继续使用旧 Store 的 nodeId（直到 UI 组件完全迁移）
        previewDataUrl
      })
      .run();

    if (!inserted) {
      loggers.image.warn(
        "processIncomingImages 插入图片节点失败，撤销节点注册",
        node.nodeId
      );
      // 清理两个 Store
      imageStore.removeImage(imageEntity.id);
      imageNodeStore.removeNode(node.nodeId);
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
          nodeId: node.nodeId
        }
      );
      // 节点保持 status: "intake" 状态，显示本地预览
      continue;
    }

    // 自动上传到 Steam（使用统一上传服务）
    try {
      const result = await ImageUploadService.uploadByNodeId(node.nodeId);
      if (!result.success) {
        loggers.image.error("图片自动上传失败:", result.error);
      }
    } catch (error) {
      loggers.image.error("图片上传异常:", error);
      // 不抛出错误，让其他图片继续处理
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
