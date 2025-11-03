import type { Editor } from "@tiptap/react";
import type {
  ImageUploadMetadata,
  ImageUploadSource
} from "../stores/useImageUploadStore";
import { uploadImageViaSteam } from "./imageUploadManager";
import { useEditorImageNodeStore } from "../stores/useEditorImageNodeStore";
import { useSteamGuideImageStore } from "../stores/useSteamGuideImageStore";

export type IncomingImageOptions = {
  source: ImageUploadSource;
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

  const metadata: ImageUploadMetadata = {
    source: options.source,
    cursorPosition: options.cursorPosition
  };

  console.info(
    "[NASGE] processIncomingImages -> 捕获到文件",
    files.map((file) => ({
      name: file.name,
      size: file.size,
      type: file.type
    }))
  );

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
      console.warn("[NASGE] 读取本地预览失败", error);
    }

    const node = imageNodeStore.registerFromLocalFile({
      file,
      metadata: {
        source: options.source,
        cursorPosition: options.cursorPosition
      },
      previewDataUrl,
      intrinsicSize
    });

    const inserted = editor
      .chain()
      .focus()
      .insertSteamImage({
        imageNodeId: node.nodeId,
        previewDataUrl
      })
      .run();

    if (!inserted) {
      console.warn(
        "[NASGE] processIncomingImages -> 插入图片节点失败，撤销节点注册",
        node.nodeId
      );
      imageNodeStore.removeNode(node.nodeId);
      continue;
    }

    try {
      await uploadImageViaSteam(file, "chapter-preview", metadata, {
        onPrepared: (record) => {
          imageNodeStore.attachUploadRecord(node.nodeId, record);
          imageNodeStore.markUploading(node.nodeId);
        },
        onUploading: () => {
          imageNodeStore.markUploading(node.nodeId);
        },
        onUploaded: (record, result) => {
          imageNodeStore.markUploaded(node.nodeId, { record, result });
          const steamImageStore = useSteamGuideImageStore.getState();
          void steamImageStore.refresh();
        },
        onFailed: (_record, message) => {
          imageNodeStore.markFailed(node.nodeId, message);
        }
      });
    } catch (error) {
      console.error("[NASGE] 图片上传失败:", error);
      throw error;
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
