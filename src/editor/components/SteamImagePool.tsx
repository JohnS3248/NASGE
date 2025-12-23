import React, { useEffect, useMemo, useState } from "react";
import { useImageUploadStore } from "../stores/useImageUploadStore";
import type { ImageUploadRecord } from "../stores/useImageUploadStore";
import { useSteamGuideImageStore } from "../stores/useSteamGuideImageStore";

type SteamImagePoolProps = {
  onDelete?: (recordId: string) => void;
};

const statusLabelMap: Record<string, string> = {
  uploading: "上传中",
  uploaded: "已上传",
  failed: "上传失败",
  idle: "待上传"
};

const SteamImagePool: React.FC<SteamImagePoolProps> = ({ onDelete }) => {
  const items = useImageUploadStore((state) => state.items);
  const order = useImageUploadStore((state) => state.order);

  const remoteItems = useSteamGuideImageStore((state) => state.items);
  const remoteStatus = useSteamGuideImageStore((state) => state.status);
  const remoteError = useSteamGuideImageStore((state) => state.error);
  const refreshRemote = useSteamGuideImageStore((state) => state.refresh);

  // 创建 Steam 图片池中已有的 previewId 集合
  const remotePreviewIds = useMemo(
    () => new Set(remoteItems.map((item) => item.previewId)),
    [remoteItems]
  );

  const records = useMemo(
    () =>
      order
        .map((id) => items[id])
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        // 只有当图片已经在 Steam 图片池中时才从队列移除
        // 这解决了上传完成但 gPreviewImages 还没更新时图片消失的问题
        .filter((item) => {
          if (item.status !== "uploaded") {
            return true; // 未完成上传的图片保留在队列
          }
          // 已上传的图片：如果 previewId 已在 Steam 图片池中，则移除（避免重复显示）
          const previewId = item.previewIds[0];
          return !previewId || !remotePreviewIds.has(previewId);
        }),
    [order, items, remotePreviewIds]
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

      {records.length > 0 && (
        <section
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.65rem"
          }}
        >
          <SectionTitle>上传队列</SectionTitle>
          {records.map((record) => (
            <UploadQueueItem
              key={record.id}
              record={record}
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
 * 使用本地 blob URL 显示预览，解决 CDN URL 404 的问题
 */
const UploadQueueItem: React.FC<{
  record: ImageUploadRecord;
  remoteItems: Array<{ previewId: string; originalUrl?: string; thumbnailUrl?: string }>;
}> = ({ record, remoteItems }) => {
  const statusLabel = statusLabelMap[record.status] ?? record.status;
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | undefined>(undefined);

  // 创建本地预览 URL
  useEffect(() => {
    if (record.file) {
      const url = URL.createObjectURL(record.file);
      setLocalPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [record.file]);

  // 计算图片源：优先使用图片池中的真实 URL，其次使用本地预览
  const src = useMemo(() => {
    const previewId = record.previewIds[0];
    if (previewId) {
      // 如果有 previewId，从图片池中查找真实 URL
      const poolImage = remoteItems.find((item) => item.previewId === previewId);
      if (poolImage?.originalUrl) return poolImage.originalUrl;
      if (poolImage?.thumbnailUrl) return poolImage.thumbnailUrl;
    }
    // 使用本地预览
    return localPreviewUrl;
  }, [record.previewIds, remoteItems, localPreviewUrl]);

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
          {record.generatedName}
        </span>
        <span
          style={{
            fontSize: "0.75rem",
            color:
              record.status === "failed"
                ? "#ff8f8f"
                : record.status === "uploaded"
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
          alt={record.generatedName}
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
          {record.status === "uploading" ? "正在上传…" : "等待上传"}
        </div>
      )}
      {record.status === "failed" && record.error && (
        <div
          style={{
            fontSize: "0.75rem",
            color: "#ff8f8f",
            padding: "0.4rem",
            background: "rgba(255, 118, 118, 0.1)",
            borderRadius: "0.5rem"
          }}
        >
          {record.error}
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
