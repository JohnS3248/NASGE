import React from "react";
import { useImageUploadStore } from "../stores/useImageUploadStore";

const statusStyle: Record<string, React.CSSProperties> = {
  uploading: { color: "#66c0f4" },
  uploaded: { color: "#8ae68a" },
  failed: { color: "#ff7b7b" },
  idle: { color: "#d7e8ff" }
};

const UploadStatusHUD: React.FC = () => {
  const items = useImageUploadStore((state) => state.items);
  const order = useImageUploadStore((state) => state.order);
  const remove = useImageUploadStore((state) => state.remove);

  const activeItems = order
    .map((id) => items[id])
    .filter((item) => item && (item.status === "uploading" || item.status === "failed"));

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
      {activeItems.map((item) => (
        <div
          key={item.id}
          style={{
            background: "rgba(10, 18, 30, 0.92)",
            border: "1px solid rgba(102, 192, 244, 0.35)",
            borderRadius: "0.75rem",
            padding: "0.65rem 0.85rem",
            boxShadow: "0 10px 22px rgba(4, 10, 18, 0.55)",
            fontSize: "0.85rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.35rem"
          }}
        >
          <div style={{ fontWeight: 600 }}>{item.originalName}</div>
          <div style={statusStyle[item.status] ?? statusStyle.idle}>
            {item.status === "uploading" && "正在上传…"}
            {item.status === "failed" && "上传失败，请重试或撤销。"}
          </div>
          {item.error ? (
            <div style={{ fontSize: "0.75rem", color: "rgba(255, 123, 123, 0.85)" }}>{item.error}</div>
          ) : null}
          {!item.error && item.metadata?.note ? (
            <div style={{ fontSize: "0.75rem", color: "rgba(207, 231, 255, 0.75)" }}>{item.metadata.note}</div>
          ) : null}
          {item.status === "failed" ? (
            <button
              type="button"
              onClick={() => remove(item.id)}
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
