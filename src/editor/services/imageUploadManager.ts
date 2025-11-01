import type { UploadScope } from "../../shared/messages";
import { uploadSteamImage } from "./steamBridge";
import { useImageUploadStore } from "../stores/useImageUploadStore";

export async function uploadImageViaSteam(
  file: File,
  scope: UploadScope = "chapter-preview"
) {
  const { prepare, markUploading, markUploaded, markFailed } = useImageUploadStore.getState();
  const record = prepare(file, scope);

  const uploadFile =
    file.name === record.generatedName
      ? file
      : new File([await file.arrayBuffer()], record.generatedName, { type: file.type });

  try {
    markUploading(record.id);
    const result = await uploadSteamImage(scope, uploadFile);
    markUploaded(record.id, result);
    const finalRecord =
      useImageUploadStore.getState().items[record.id] ?? record;
    return { record: finalRecord, result };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "上传失败，未知错误。";
    markFailed(record.id, message);
    throw error;
  }
}

export function clearUploadState(scope?: UploadScope) {
  useImageUploadStore.getState().reset(scope);
}
