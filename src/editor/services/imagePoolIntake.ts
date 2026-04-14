/**
 * 统一的图片入池服务
 * 合并 TipTapEditor / ImageFloatingPanel / ImageGrid 三处重复的入池逻辑
 */
import { useSteamGuideImageStore, type ImageWithState } from "../stores/useSteamGuideImageStore";
import { useImagePanelStore } from "../stores/useImagePanelStore";
import { useEditorConfigStore } from "../stores/useEditorConfigStore";
import { useGuideStore, isOnlineMode } from "../stores/useGuideStore";
import { ImageUploadService } from "./ImageUploadService";
import { loggers } from "../../shared/logger";
import { toast } from "../stores/useToastStore";
import { dialog } from "../stores/useDialogStore";
import { STEAM_IMAGE_SIZE_LIMIT } from "../constants/limits";
import i18n from "i18next";

export interface PoolIntakeOptions {
  source: "paste" | "drop";
  currentArchiveId: string | null;
  openPanelOnAdd?: boolean; // TipTapEditor: true, 面板内: false
}

/**
 * 根据 MIME 类型获取默认文件名（用于无名剪贴板图片）
 */
function getDefaultFileName(mimeType: string): string {
  const ext = mimeType === "image/png" ? "png"
    : mimeType === "image/jpeg" ? "jpg"
    : mimeType === "image/gif" ? "gif"
    : mimeType === "image/webp" ? "webp" : "png";
  return `image.${ext}`;
}

/**
 * 统一的图片入池流程（粘贴/拖入共用）
 * 1. 为无名剪贴板图片补全文件名
 * 2. 单图超限 → 弹窗提示 → 不入池
 * 3. 多图 + rename → 批量重命名弹窗（超限灰色）→ 只入池合规图片
 * 4. 直接入池（不重命名 / 单图合规）
 * 5. 超限 toast 通知
 * 6. 重复图片 toast 通知
 *
 * 上传集成规则：
 * - 重命名弹窗确认后 / 不重命名 → queuePoolBatchUpload — 名字已确定，立即上传
 */
export async function addFilesToPool(
  files: File[],
  options: PoolIntakeOptions
): Promise<void> {
  // 离线模式下图片无法上传到 Steam，提前拦截
  const mode = useGuideStore.getState().mode;
  if (!isOnlineMode(mode)) {
    toast.warning(i18n.t("image.offlineBlocked", { ns: "editor" }));
    return;
  }

  const configStore = useEditorConfigStore.getState();
  const imagePanelStore = useImagePanelStore.getState();

  const shouldRename = options.source === "paste"
    ? configStore.promptRenameOnPaste
    : configStore.promptRenameOnDrop;
  const shouldAutoUpload = configStore.autoUploadInPanel;

  // 为无名剪贴板图片补全文件名
  const normalizedFiles = files.map(file => {
    if (!file.name || file.name === "image.png") {
      const defaultName = getDefaultFileName(file.type);
      if (file.name !== defaultName) {
        return new File([file], defaultName, { type: file.type, lastModified: file.lastModified });
      }
    }
    return file;
  });

  // 收集文件信息（生成临时 URL 供弹窗预览）
  const fileInfos = normalizedFiles.map(file => ({
    file,
    fileName: file.name,
    fileSize: file.size,
    thumbnailUrl: URL.createObjectURL(file),
    isOversize: file.size > STEAM_IMAGE_SIZE_LIMIT
  }));

  const validFiles = fileInfos.filter(f => !f.isOversize);
  const oversizeFiles = fileInfos.filter(f => f.isOversize);

  // ---- 单图超限 → 弹窗阻止 ----
  if (fileInfos.length === 1 && oversizeFiles.length === 1) {
    const f = oversizeFiles[0];
    const sizeMB = (f.fileSize / (1024 * 1024)).toFixed(1);
    await dialog.confirm({
      message: i18n.t("image.tooLargeBlocked", { ns: "editor", fileName: f.fileName, size: sizeMB }),
      confirmText: i18n.t("gotIt", { ns: "common" }),
      cancelText: ""
    });
    for (const info of fileInfos) URL.revokeObjectURL(info.thumbnailUrl);
    return;
  }

  // ---- 重命名 → 批量重命名弹窗（单图/多图统一）----
  if (shouldRename) {
    const batchImages = fileInfos.map(f => ({
      id: f.fileName,
      currentName: f.fileName,
      fileSize: f.fileSize,
      thumbnailUrl: f.thumbnailUrl
    }));
    const renameResult = await dialog.batchRename({ images: batchImages });
    for (const info of fileInfos) URL.revokeObjectURL(info.thumbnailUrl);

    if (!renameResult) return; // 用户取消

    const addedFileNames: string[] = [];
    for (const f of validFiles) {
      const newBaseName = renameResult.get(f.fileName);
      if (newBaseName === undefined) continue;
      const ext = f.fileName.match(/\.[^.]+$/)?.[0] ?? "";
      const renamedFile = new File([f.file], newBaseName + ext, {
        type: f.file.type,
        lastModified: f.file.lastModified
      });
      const result = await useSteamGuideImageStore
        .getState()
        .addLocalImage(renamedFile, options.currentArchiveId ?? undefined);
      if (!result.skipped) {
        addedFileNames.push(result.image.fileName);
      }
    }

    if (addedFileNames.length > 0) {
      if (options.openPanelOnAdd) imagePanelStore.open();
      // 多图批量重命名后名字已确定 → 立即上传
      if (shouldAutoUpload) {
        const latestStore = useSteamGuideImageStore.getState();
        const latestImages = addedFileNames
          .map(fn => latestStore.getImageById(fn))
          .filter(Boolean) as ImageWithState[];
        ImageUploadService.queuePoolBatchUpload(latestImages);
      }
    }
    loggers.image.info("批量重命名完成，已入池", { addedFileNames });
    return;
  }

  // 清理临时 URL（单图/不重命名场景不需要弹窗预览）
  for (const info of fileInfos) URL.revokeObjectURL(info.thumbnailUrl);

  // ---- 直接入池（不重命名 / 单图合规）----
  const addedImages: ImageWithState[] = [];
  const skippedFiles: { fileName: string; existingFileName: string; reason: string }[] = [];

  for (const f of validFiles) {
    const result = await useSteamGuideImageStore
      .getState()
      .addLocalImage(f.file, options.currentArchiveId ?? undefined);
    if (result.skipped) {
      skippedFiles.push({
        fileName: f.file.name,
        existingFileName: result.existingFileName || "",
        reason: result.reason === "duplicate_uploaded" ? "已上传" : "待上传"
      });
    } else {
      addedImages.push(result.image);
    }
  }

  // 超限 toast 通知
  for (const f of oversizeFiles) {
    const sizeMB = (f.fileSize / (1024 * 1024)).toFixed(1);
    toast.error(i18n.t("image.tooLargeSkipped", { ns: "editor", fileName: f.fileName, size: sizeMB }));
  }

  // 重复图片 toast 通知
  if (skippedFiles.length > 0) {
    if (normalizedFiles.length === 1) {
      toast.info(`"${skippedFiles[0].fileName}" 已存在（${skippedFiles[0].reason}），已跳过`);
    } else if (addedImages.length > 0) {
      toast.info(`已添加 ${addedImages.length} 张图片\n跳过 ${skippedFiles.length} 张重复图片`);
    }
  }

  if (addedImages.length > 0) {
    if (options.openPanelOnAdd) imagePanelStore.open();

    // 不重命名 → 名字已确定，立即上传
    if (shouldAutoUpload) {
      ImageUploadService.queuePoolBatchUpload(addedImages);
    }
  }

  loggers.image.info("已添加图片到图片池", {
    added: addedImages.length,
    skipped: skippedFiles.length,
    oversize: oversizeFiles.length,
    source: options.source
  });
}
