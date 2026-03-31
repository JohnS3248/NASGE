import React, { useMemo } from "react";
import { useImageStore } from "../stores/useImageStore";

const STATUS_COLOR: Record<string, string> = {
  uploading: "text-accent",
  error: "text-[#ff7b7b]",
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
    <div className="fixed right-6 bottom-6 z-[9999] flex flex-col gap-2 min-w-[220px]">
      {activeItems.map((image) => (
        <div
          key={image.id}
          className="bg-[rgba(10,18,30,0.92)] border border-border-accent rounded-lg px-3.5 py-2.5 shadow-xl text-[0.85rem] flex flex-col gap-1.5 animate-toast-enter"
        >
          <div className="font-semibold text-text-primary">{image.originalName}</div>
          <div className={STATUS_COLOR[image.status] ?? "text-text-primary"}>
            {image.status === "uploading" && "正在上传…"}
            {image.status === "error" && "上传失败，请重试或撤销。"}
          </div>
          {image.error ? (
            <div className="text-xs text-[rgba(255,123,123,0.85)]">{image.error}</div>
          ) : null}
          {image.status === "error" ? (
            <button
              type="button"
              onClick={() => removeImage(image.id)}
              className="self-end px-2.5 py-1 rounded-md border-0 bg-[rgba(255,123,123,0.18)] text-[#ff9a9a] cursor-pointer text-sm"
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
