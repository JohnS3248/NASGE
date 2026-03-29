import type { UploadResult, UploadScope } from "../../shared/messages";
import { uploadSteamImage } from "./steamBridge";
import { loggers } from "../../shared/logger";
import {
  useImageUploadStore,
  type ImageUploadMetadata,
  type ImageUploadRecord
} from "../stores/useImageUploadStore";

export type UploadLifecycleHooks = {
  onPrepared?: (record: ImageUploadRecord) => void;
  onUploading?: (record: ImageUploadRecord) => void;
  onUploaded?: (
    record: ImageUploadRecord,
    result: UploadResult
  ) => void;
  onFailed?: (record: ImageUploadRecord, error: string) => void;
};

export async function uploadImageViaSteam(
  file: File,
  scope: UploadScope = "chapter-preview",
  metadata?: ImageUploadMetadata,
  hooks?: UploadLifecycleHooks
) {
  const store = useImageUploadStore.getState();
  const { prepare, markUploading, markUploaded, markFailed, setMetadata } = store;
  const record = prepare(file, scope, metadata);
  hooks?.onPrepared?.(record);

  loggers.image.info("uploadImageViaSteam -> 准备上传文件", {
    name: file.name,
    size: file.size,
    type: file.type
  });

  let slowWarningTimer: number | undefined;

  try {
    markUploading(record.id);
    hooks?.onUploading?.(
      useImageUploadStore.getState().items[record.id] ?? record
    );
    slowWarningTimer = window.setTimeout(() => {
      useImageUploadStore.getState().setMetadata(record.id, {
        note: "等待 Steam 响应…请检查 Steam 页面是否弹出提示。"
      });
    }, 7000);

    const result = await uploadSteamImage(scope, file, record.originalName);
    markUploaded(record.id, result);
    setMetadata(record.id, { note: undefined });
    const finalRecord =
      useImageUploadStore.getState().items[record.id] ?? record;
    hooks?.onUploaded?.(finalRecord, result);
    return { record: finalRecord, result };
  } catch (error) {
    const message = formatUploadErrorMessage(error);
    markFailed(record.id, message);
    setMetadata(record.id, { note: undefined });
    const failedRecord =
      useImageUploadStore.getState().items[record.id] ?? record;
    hooks?.onFailed?.(failedRecord, message);
    throw error instanceof Error ? error : new Error(message);
  } finally {
    if (slowWarningTimer !== undefined) {
      window.clearTimeout(slowWarningTimer);
    }
  }
}

export function clearUploadState(scope?: UploadScope) {
  useImageUploadStore.getState().reset(scope);
}

function formatUploadErrorMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : "";
  if (rawMessage.includes("Could not establish connection") || rawMessage.includes("Receiving end does not exist")) {
    return "未能连接到 Steam 页面，请确认已打开 Steam 指南编辑页并刷新后重试。";
  }

  if (rawMessage.includes("The message port closed before a response was received")) {
    return "未收到 Steam 页面响应，请刷新相关页面后重试。";
  }

  if (rawMessage.includes("扩展尚未获得访问 Steam 网页的权限")) {
    return rawMessage;
  }

  if (/错误码\s*8/.test(rawMessage)) {
    return "Steam 返回错误 8：无法解析图片文件，请确认图片未损坏并重新尝试。";
  }

  if (/错误码\s*29/.test(rawMessage)) {
    return "Steam 返回错误 29：Steam 会话可能已失效或账号当前不可上传，请刷新 Steam 页面后重试。";
  }

  if (rawMessage) {
    return rawMessage;
  }

  return "上传失败，未知错误。";
}
