import React, { useEffect, useMemo, useState } from "react";
import { useImageStore } from "../stores/useImageStore";
import { useSteamGuideImageStore } from "../stores/useSteamGuideImageStore";
import type { ImageEntity, ImageLifecycleStatus } from "../types/image";

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

const SteamImagePool: React.FC<SteamImagePoolProps> = ({ onDelete }) => {
  // 从新 Store 读取图片数据
  const allImages = useImageStore((state) => state.images);

  const remoteItems = useSteamGuideImageStore((state) => state.items);
  const remoteStatus = useSteamGuideImageStore((state) => state.status);
  const remoteError = useSteamGuideImageStore((state) => state.error);
  const refreshRemote = useSteamGuideImageStore((state) => state.refresh);

  // 创建 Steam 图片池中已有的 previewId 集合
  const remotePreviewIds = useMemo(
    () => new Set(remoteItems.map((item) => item.previewId)),
    [remoteItems]
  );

  // 上传队列：显示 local、uploading、error 状态的图片
  // 已上传且在图片池中的图片不显示（避免重复）
  const uploadQueueImages = useMemo(
    () =>
      Object.values(allImages)
        .filter((image): image is ImageEntity => {
          // 显示本地、上传中、错误状态的图片
          if (image.status === "local" || image.status === "uploading" || image.status === "error") {
            return true;
          }
          // 已上传但尚未出现在图片池中的图片也显示
          if (image.status === "uploaded" && image.steamPreviewId) {
            return !remotePreviewIds.has(image.steamPreviewId);
          }
          return false;
        })
        .sort((a, b) => b.createdAt - a.createdAt), // 按创建时间倒序
    [allImages, remotePreviewIds]
  );

  useEffect(() => {
    if (remoteStatus === "idle") {
      void refreshRemote();
    }
  }, [remoteStatus, refreshRemote]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        padding: "1rem",
        borderRadius: "0.9rem",
        background: "rgba(8, 14, 23, 0.82)",
        border: "1px solid rgba(102, 192, 244, 0.2)",
        maxHeight: "74vh",
        overflowY: "auto"
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontWeight: 600,
          color: "#d7e8ff",
          fontSize: "0.95rem"
        }}
      >
        <span>Steam 图片池</span>
        <button
          type="button"
          onClick={() => refreshRemote()}
          style={{
            border: "1px solid rgba(102, 192, 244, 0.3)",
            background: "rgba(11, 20, 33, 0.82)",
            color: "#bcd9ff",
            borderRadius: "0.5rem",
            padding: "0.25rem 0.6rem",
            fontSize: "0.75rem",
            cursor: remoteStatus === "loading" ? "progress" : "pointer"
          }}
          disabled={remoteStatus === "loading"}
        >
          {remoteStatus === "loading" ? "刷新中…" : "刷新"}
        </button>
      </div>
      {remoteError ? (
        <div
          style={{
            padding: "0.5rem 0.6rem",
            borderRadius: "0.6rem",
            background: "rgba(255, 118, 118, 0.12)",
            color: "#ffb3b3",
            fontSize: "0.78rem"
          }}
        >
          {remoteError}
        </div>
      ) : null}

      {uploadQueueImages.length > 0 && (
        <section
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.65rem"
          }}
        >
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

      <section
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.65rem"
        }}
      >
        <SectionTitle>Steam 已有图片</SectionTitle>
        {remoteStatus === "loading" && !remoteItems.length ? (
          <div style={{ fontSize: "0.8rem", color: "rgba(205, 226, 255, 0.7)" }}>正在加载图片池…</div>
        ) : null}
        {!remoteItems.length && remoteStatus === "ready" ? (
          <div style={{ fontSize: "0.8rem", color: "rgba(205, 226, 255, 0.65)" }}>
            当前指南尚未有历史图片。
          </div>
        ) : null}
        {remoteItems.map((asset) => (
          <div
            key={asset.previewId}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              padding: "0.6rem",
              borderRadius: "0.7rem",
              background: "rgba(12, 20, 32, 0.9)",
              border: "1px solid rgba(102, 192, 244, 0.18)"
            }}
          >
            <div
              style={{
                fontSize: "0.8rem",
                color: "#cfe2ff",
                fontWeight: 600
              }}
            >
              {asset.fileName}
            </div>
            {asset.thumbnailUrl ? (
              <img
                src={asset.thumbnailUrl}
                alt={asset.fileName}
                style={{
                  width: "100%",
                  borderRadius: "0.6rem",
                  objectFit: "cover",
                  background: "rgba(14, 26, 40, 0.7)"
                }}
              />
            ) : null}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "0.75rem",
                color: "rgba(205, 226, 255, 0.65)"
              }}
            >
              <span>预览 ID: {asset.previewId}</span>
              <button
                type="button"
                onClick={() => onDelete?.(asset.previewId)}
                style={{
                  border: "none",
                  borderRadius: "0.5rem",
                  padding: "0.3rem 0.6rem",
                  background: "rgba(255, 118, 118, 0.2)",
                  color: "#ff9a9a",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "0.75rem"
                }}
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

/**
 * 上传队列项组件
 * 使用新 Store 的 ImageEntity 数据
 */
const UploadQueueItem: React.FC<{
  image: ImageEntity;
  remoteItems: Array<{ previewId: string; originalUrl?: string; thumbnailUrl?: string }>;
}> = ({ image, remoteItems }) => {
  const statusLabel = statusLabelMap[image.status] ?? image.status;

  // 计算图片源：优先使用图片池中的真实 URL，其次使用本地预览
  const src = useMemo(() => {
    if (image.steamPreviewId) {
      // 如果有 steamPreviewId，从图片池中查找真实 URL
      const poolImage = remoteItems.find((item) => item.previewId === image.steamPreviewId);
      if (poolImage?.originalUrl) return poolImage.originalUrl;
      if (poolImage?.thumbnailUrl) return poolImage.thumbnailUrl;
    }
    // 使用 Steam URLs（如果有）
    if (image.steamUrls?.originalUrl) return image.steamUrls.originalUrl;
    if (image.steamUrls?.thumbnailUrl) return image.steamUrls.thumbnailUrl;
    // 使用本地预览
    return image.localPreviewUrl;
  }, [image.steamPreviewId, image.steamUrls, image.localPreviewUrl, remoteItems]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.55rem",
        padding: "0.65rem",
        borderRadius: "0.7rem",
        background: "rgba(12, 20, 32, 0.9)",
        border: "1px solid rgba(102, 192, 244, 0.18)"
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.4rem"
        }}
      >
        <span
          style={{
            fontSize: "0.8rem",
            fontWeight: 600,
            color: "#cfe2ff",
            lineHeight: 1.4
          }}
        >
          {image.fileName}
        </span>
        <span
          style={{
            fontSize: "0.75rem",
            color:
              image.status === "error"
                ? "#ff8f8f"
                : image.status === "uploaded" || image.status === "synced"
                  ? "#85ffba"
                  : "#9ac7ff"
          }}
        >
          {statusLabel}
        </span>
      </div>
      {src ? (
        <img
          src={src}
          alt={image.fileName}
          style={{
            width: "100%",
            borderRadius: "0.6rem",
            objectFit: "cover",
            background: "rgba(14, 26, 40, 0.7)"
          }}
        />
      ) : (
        <div
          style={{
            height: "120px",
            borderRadius: "0.6rem",
            background: "rgba(14, 26, 40, 0.7)",
            border: "1px dashed rgba(102, 192, 244, 0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(205, 226, 255, 0.6)",
            fontSize: "0.8rem"
          }}
        >
          {image.status === "uploading" ? "正在上传…" : "等待上传"}
        </div>
      )}
      {image.status === "error" && image.error && (
        <div
          style={{
            fontSize: "0.75rem",
            color: "#ff8f8f",
            padding: "0.4rem",
            background: "rgba(255, 118, 118, 0.1)",
            borderRadius: "0.5rem"
          }}
        >
          {image.error}
        </div>
      )}
    </div>
  );
};

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontSize: "0.78rem",
      color: "rgba(173, 202, 236, 0.78)",
      letterSpacing: "0.08em",
      textTransform: "uppercase"
    }}
  >
    {children}
  </div>
);

export default SteamImagePool;
