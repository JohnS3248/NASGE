import React, { useMemo } from "react";
import { useImageStore } from "../stores/useImageStore";
import type { ImageLifecycleStatus } from "../types/image";

const statusStyle: Record<string, React.CSSProperties> = {
  uploading: { color: "var(--color-primary, #66c0f4)" },
  uploaded: { color: "var(--color-success, #8ae68a)" },
  error: { color: "var(--color-error, #ff7b7b)" },
  local: { color: "var(--text-primary, #d7e8ff)" }
};

const UploadStatusHUD: React.FC = () => {
  const allImages = useImageStore((state) => state.images);
  const removeImage = useImageStore((state) => state.removeImage);

  // 只显示上传中或错误状态的图片
  const activeItems = useMemo(
    () =>
      Object.values(allImages)
        .filter((image) => image.status === "uploading" || image.status === "error")
        .sort((a, b) => b.createdAt - a.createdAt),
    [allImages]
  );

  if (!activeItems.length) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        right: "1.5rem",
        bottom: "1.5rem",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        minWidth: "220px"
      }}
    >
      {activeItems.map((image) => (
        <div
          key={image.id}
          style={{
            background: "rgba(10, 18, 30, 0.92)",
            border: "1px solid rgba(102, 192, 244, 0.35)",
            borderRadius: "var(--radius-md, 0.75rem)",
            padding: "0.65rem 0.85rem",
            boxShadow: "0 10px 22px rgba(4, 10, 18, 0.55)",
            fontSize: "0.85rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.35rem"
          }}
        >
          <div style={{ fontWeight: 600 }}>{image.originalName}</div>
          <div style={statusStyle[image.status] ?? statusStyle.local}>
            {image.status === "uploading" && "正在上传…"}
            {image.status === "error" && "上传失败，请重试或撤销。"}
          </div>
          {image.error ? (
            <div style={{ fontSize: "0.75rem", color: "rgba(255, 123, 123, 0.85)" }}>{image.error}</div>
          ) : null}
          {image.status === "error" ? (
            <button
              type="button"
              onClick={() => removeImage(image.id)}
              style={{
                alignSelf: "flex-end",
                padding: "0.25rem 0.6rem",
                borderRadius: "0.45rem",
                border: "none",
                background: "rgba(255, 123, 123, 0.18)",
                color: "#ff9a9a",
                cursor: "pointer"
              }}
            >
              知道了
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
};

export default UploadStatusHUD;
