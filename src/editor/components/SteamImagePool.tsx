import React, { useEffect, useMemo } from "react";
import { useImageStore } from "../stores/useImageStore";
import { useSteamGuideImageStore } from "../stores/useSteamGuideImageStore";
import type { ImageEntity, ImageLifecycleStatus } from "../types/image";
import { SkeletonBlock, SkeletonLine } from "./Skeleton";

type SteamImagePoolProps = {
  onDelete?: (recordId: string) => void;
};

const statusLabelMap: Record<ImageLifecycleStatus, string> = {
  local: "待上传",
  uploading: "上传中",
  uploaded: "已上传",
  synced: "已同步",
  error: "上传失败",
  orphaned: "引用失效"
};

const STATUS_COLOR: Record<string, string> = {
  error: "text-danger",
  uploaded: "text-success",
  synced: "text-success",
};

const SteamImagePool: React.FC<SteamImagePoolProps> = ({ onDelete }) => {
  const allImages = useImageStore((state) => state.images);

  const remoteItems = useSteamGuideImageStore((state) => state.items);
  const remoteStatus = useSteamGuideImageStore((state) => state.status);
  const remoteError = useSteamGuideImageStore((state) => state.error);
  const refreshRemote = useSteamGuideImageStore((state) => state.refresh);

  const remotePreviewIds = useMemo(
    () => new Set(remoteItems.map((item) => item.previewId)),
    [remoteItems]
  );

  const uploadQueueImages = useMemo(
    () =>
      Object.values(allImages)
        .filter((image): image is ImageEntity => {
          if (image.status === "local" || image.status === "uploading" || image.status === "error") {
            return true;
          }
          if (image.status === "uploaded" && image.steamPreviewId) {
            return !remotePreviewIds.has(image.steamPreviewId);
          }
          return false;
        })
        .sort((a, b) => b.createdAt - a.createdAt),
    [allImages, remotePreviewIds]
  );

  useEffect(() => {
    if (remoteStatus === "idle") {
      void refreshRemote();
    }
  }, [remoteStatus, refreshRemote]);

  return (
    <div className="flex flex-col gap-3 p-4 rounded-lg bg-[rgba(8,14,23,0.82)] border border-accent/20 max-h-[74vh] overflow-y-auto">
      <div className="flex justify-between items-center font-semibold text-text-primary text-[0.95rem]">
        <span>Steam 图片池</span>
        <button
          type="button"
          onClick={() => refreshRemote()}
          className={`border border-accent/30 bg-bg-app/80 text-accent rounded-lg px-2.5 py-1 text-xs ${remoteStatus === "loading" ? "cursor-progress" : "cursor-pointer"}`}
          disabled={remoteStatus === "loading"}
        >
          {remoteStatus === "loading" ? "刷新中…" : "刷新"}
        </button>
      </div>
      {remoteError ? (
        <div className="px-2.5 py-2 rounded-md bg-danger/12 text-danger text-[0.78rem]">
          {remoteError}
        </div>
      ) : null}

      {uploadQueueImages.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <SectionTitle>上传队列</SectionTitle>
          {uploadQueueImages.map((image) => (
            <UploadQueueItem
              key={image.id}
              image={image}
              remoteItems={remoteItems}
            />
          ))}
        </section>
      )}

      <section className="flex flex-col gap-2.5">
        <SectionTitle>Steam 已有图片</SectionTitle>
        {remoteStatus === "loading" && !remoteItems.length ? (
          <div className="flex flex-col gap-2.5">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex flex-col gap-2 p-2.5 rounded-lg bg-bg-app/90 border border-accent/18">
                <SkeletonLine width="40%" height={13} />
                <SkeletonBlock height={120} />
                <SkeletonLine width="60%" height={10} />
              </div>
            ))}
          </div>
        ) : null}
        {!remoteItems.length && remoteStatus === "ready" ? (
          <div className="text-[0.8rem] text-text-secondary/65">
            当前指南尚未有历史图片。
          </div>
        ) : null}
        {remoteItems.map((asset) => (
          <div
            key={asset.previewId}
            className="flex flex-col gap-2 p-2.5 rounded-lg bg-bg-app/90 border border-accent/18"
          >
            <div className="text-[0.8rem] text-text-primary font-semibold">
              {asset.fileName}
            </div>
            {asset.thumbnailUrl ? (
              <img
                src={asset.thumbnailUrl}
                alt={asset.fileName}
                className="w-full rounded-md object-cover bg-bg-app/70"
              />
            ) : null}
            <div className="flex justify-between items-center text-xs text-text-secondary/65">
              <span>预览 ID: {asset.previewId}</span>
              <button
                type="button"
                onClick={() => onDelete?.(asset.previewId)}
                className="border-0 rounded-lg px-2.5 py-1 bg-danger/20 text-danger cursor-pointer font-semibold text-xs"
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
};

const UploadQueueItem: React.FC<{
  image: ImageEntity;
  remoteItems: Array<{ previewId: string; originalUrl?: string; thumbnailUrl?: string }>;
}> = ({ image, remoteItems }) => {
  const statusLabel = statusLabelMap[image.status] ?? image.status;

  const src = useMemo(() => {
    if (image.steamPreviewId) {
      const poolImage = remoteItems.find((item) => item.previewId === image.steamPreviewId);
      if (poolImage?.originalUrl) return poolImage.originalUrl;
      if (poolImage?.thumbnailUrl) return poolImage.thumbnailUrl;
    }
    if (image.steamUrls?.originalUrl) return image.steamUrls.originalUrl;
    if (image.steamUrls?.thumbnailUrl) return image.steamUrls.thumbnailUrl;
    return image.localPreviewUrl;
  }, [image.steamPreviewId, image.steamUrls, image.localPreviewUrl, remoteItems]);

  return (
    <div className="flex flex-col gap-2 p-2.5 rounded-lg bg-bg-app/90 border border-accent/18">
      <div className="flex justify-between items-center gap-1.5">
        <span className="text-[0.8rem] font-semibold text-text-primary leading-snug">
          {image.fileName}
        </span>
        <span className={`text-xs ${STATUS_COLOR[image.status] ?? "text-accent"}`}>
          {statusLabel}
        </span>
      </div>
      {src ? (
        <img
          src={src}
          alt={image.fileName}
          className="w-full rounded-md object-cover bg-bg-app/70"
        />
      ) : (
        <div className="h-[120px] rounded-md bg-bg-app/70 border border-dashed border-accent/25 flex items-center justify-center text-text-secondary/60 text-[0.8rem]">
          {image.status === "uploading" ? "正在上传…" : "等待上传"}
        </div>
      )}
      {image.status === "error" && image.error && (
        <div className="text-xs text-danger p-1.5 bg-danger/10 rounded-lg">
          {image.error}
        </div>
      )}
    </div>
  );
};

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[0.78rem] text-text-secondary/78 tracking-wider uppercase">
    {children}
  </div>
);

export default SteamImagePool;
