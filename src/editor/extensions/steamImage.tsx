import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import type { CommandProps } from "@tiptap/core";
import { useSteamGuideImageStore } from "../stores/useSteamGuideImageStore";
import { useImageStore } from "../stores/useImageStore";
import { useImageFromStore } from "../hooks/useImageFromStore";
import type { ImageEntity, ImageSizePreset, ImageAlignment, ImageSource } from "../types/image";
import { DEFAULT_IMAGE_PRESET, DEFAULT_IMAGE_ALIGNMENT } from "../types/image";
import { ImageIcon } from "../components/ImageFloatingPanel/icons";
import { loggers } from "../../shared/logger";
import { simulateSteamUrlTruncation } from "../utils/steamUrlTruncation";

// Steam 尺寸常量 (来自 Steam 实际测量 2025-12-31)
const STEAM_CONTENT_WIDTH = 638;
const STEAM_THUMB_WIDTH = 311;

/**
 * 确保图片在 useImageStore 中有记录
 * 处理从 Steam 图片池或 BBCode 导入但尚未注册的图片
 */
function ensureInStore(
  steamPoolImage: { previewId: string; fileName: string; thumbnailUrl?: string; originalUrl?: string } | undefined,
  attrPreviewId: string | null,
  displaySettings?: { preset?: string; alignment?: string }
): void {
  const store = useImageStore.getState();

  if (steamPoolImage) {
    const existing = store.getImageBySteamPreviewId(steamPoolImage.previewId);
    if (!existing) {
      store.importFromSteamPool({
        steamPreviewId: steamPoolImage.previewId,
        fileName: steamPoolImage.fileName,
        thumbnailUrl: steamPoolImage.thumbnailUrl,
        originalUrl: steamPoolImage.originalUrl,
        display: displaySettings ? {
          preset: displaySettings.preset as ImageSizePreset,
          alignment: displaySettings.alignment as ImageAlignment
        } : undefined
      });
    }
    return;
  }

  if (attrPreviewId) {
    const existing = store.getImageBySteamPreviewId(attrPreviewId);
    if (!existing) {
      store.importFromBBCode({
        steamPreviewId: attrPreviewId,
        fileName: `image-${attrPreviewId}`
      });
    }
  }
}

const SteamImage = Node.create({
    name: "steamImage",
    group: "block",
    draggable: true,
    atom: true,
    selectable: true,
    inline: false,
    addAttributes() {
      return {
        imageNodeId: {
          default: null,
          renderHTML: (attributes) => ({
            "data-image-node-id": attributes.imageNodeId
          }),
          parseHTML: (element) => element.getAttribute("data-image-node-id")
        },
        uploadId: {
          default: null,
          renderHTML: (attributes) => ({
            "data-upload-id": attributes.uploadId
          }),
          parseHTML: (element) => element.getAttribute("data-upload-id")
        },
        previewId: {
          default: null,
          renderHTML: (attributes) => ({
            "data-preview-id": attributes.previewId
          }),
          parseHTML: (element) => element.getAttribute("data-preview-id")
        },
        sizePreset: {
          default: DEFAULT_IMAGE_PRESET,
          renderHTML: (attributes) => ({
            "data-size-preset": attributes.sizePreset
          }),
          parseHTML: (element) => element.getAttribute("data-size-preset")
        },
        alignment: {
          default: DEFAULT_IMAGE_ALIGNMENT,
          renderHTML: (attributes) => ({
            "data-alignment": attributes.alignment
          }),
          parseHTML: (element) => element.getAttribute("data-alignment")
        },
        fileName: {
          default: null,
          renderHTML: (attributes) => ({
            "data-file-name": attributes.fileName
          }),
          parseHTML: (element) => element.getAttribute("data-file-name")
        },
        previewDataUrl: {
          default: null,
          renderHTML: () => ({}),
          parseHTML: () => null
        },
        source: {
          default: null,
          renderHTML: (attributes) => ({
            "data-source": attributes.source
          }),
          parseHTML: (element) => element.getAttribute("data-source")
        },
        imageUrl: {
          default: null,
          renderHTML: (attributes) => ({
            "data-image-url": attributes.imageUrl
          }),
          parseHTML: (element) => element.getAttribute("data-image-url")
        }
      };
    },
    parseHTML() {
      return [
        {
          tag: "figure[data-nasge-image]",
          getAttrs: (element) => {
            if (typeof element === "string") return false;
            const el = element as HTMLElement;
            return {
              previewId: el.getAttribute("data-preview-id") || null,
              fileName: el.getAttribute("data-file-name") || null,
              sizePreset: el.getAttribute("data-size-preset") || DEFAULT_IMAGE_PRESET,
              alignment: el.getAttribute("data-alignment") || DEFAULT_IMAGE_ALIGNMENT,
              imageNodeId: el.getAttribute("data-image-node-id") || null,
              source: el.getAttribute("data-source") || null,
              imageUrl: el.getAttribute("data-image-url") || null
            };
          }
        }
      ];
    },
    renderHTML({ HTMLAttributes }) {
      return [
        "figure",
        mergeAttributes(
          {
            "data-nasge-image": "true"
          },
          HTMLAttributes
        )
      ];
    },
    addCommands() {
      return {
        insertSteamImage:
          (attrs: Record<string, unknown>) =>
          ({ commands }: CommandProps) =>
            commands.insertContent({
              type: this.name,
              attrs: {
                sizePreset: DEFAULT_IMAGE_PRESET,
                alignment: DEFAULT_IMAGE_ALIGNMENT,
                ...attrs
              }
            })
      };
    },
    addNodeView() {
      return ReactNodeViewRenderer(SteamImageNodeView);
    }
  });

export default SteamImage;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    steamImage: {
      insertSteamImage: (attrs: Record<string, unknown>) => ReturnType;
    };
  }
}

type WrapperProps = NodeViewProps & {
  className?: string;
};

const SteamImageNodeView: React.FC<WrapperProps> = ({
  node,
  updateAttributes,
  getPos
}) => {
  const imageNodeId = node.attrs.imageNodeId as string | null;
  const attrPreviewId = node.attrs.previewId as string | null;
  const attrSizePreset = node.attrs.sizePreset as string | null;
  const attrAlignment = node.attrs.alignment as string | null;
  const attrUploadId = node.attrs.uploadId as string | null;
  const attrFileName = node.attrs.fileName as string | null;
  const attrPreviewDataUrl = node.attrs.previewDataUrl as string | null;
  const attrSource = node.attrs.source as string | null;
  const attrImageUrl = node.attrs.imageUrl as string | null;

  // screenshot 类型直接用 imageUrl，跳过 store 查找
  const isScreenshot = attrSource === "screenshot" && !!attrImageUrl;

  // 从 useImageStore 获取图片实体
  const imageEntity = useImageFromStore(imageNodeId, attrPreviewId);

  // 从 Steam 图片池中查找图片（用于尚未注册到 useImageStore 的图片）
  const steamPoolImage = useSteamGuideImageStore(
    (state) => {
      if (imageEntity) return undefined;
      if (attrPreviewId) {
        return state.items.find((item) => item.previewId === attrPreviewId);
      }
      // 防御兜底：本地未上传图片 previewId 为空，通过 fileName 查找
      if (attrFileName) {
        return state.items.find((item) => item.fileName === attrFileName && !item.previewId);
      }
      return undefined;
    }
  );

  // 确保图片在 useImageStore 中有记录
  const hasSyncedRef = useRef(false);
  useEffect(() => {
    if (imageEntity) {
      hasSyncedRef.current = true;
      return;
    }
    if (hasSyncedRef.current) return;
    if (!steamPoolImage && !attrPreviewId && !attrFileName) return;

    hasSyncedRef.current = true;
    ensureInStore(steamPoolImage, attrPreviewId, {
      preset: attrSizePreset as string,
      alignment: attrAlignment as string
    });
  }, [imageEntity, steamPoolImage, attrPreviewId, attrSizePreset, attrAlignment]);

  // 同步 Store 数据到 TipTap 节点属性
  useEffect(() => {
    const effectivePreviewId = imageEntity?.steamPreviewId ?? null;

    if (!imageEntity) return;

    const nextAttrs = {
      imageNodeId: imageEntity.sourceNodeId ?? imageEntity.id,
      uploadId: null,
      previewId: effectivePreviewId,
      sizePreset: attrSizePreset ?? imageEntity.display.preset ?? "original",
      alignment: attrAlignment ?? imageEntity.display.alignment ?? "inline",
      fileName: imageEntity.fileName ?? null,
      previewDataUrl: imageEntity.localPreviewUrl ?? null
    };

    const currentAttrs = {
      imageNodeId,
      uploadId: attrUploadId,
      previewId: attrPreviewId,
      sizePreset: attrSizePreset,
      alignment: attrAlignment,
      fileName: attrFileName,
      previewDataUrl: attrPreviewDataUrl
    };

    let changed = false;
    for (const key of Object.keys(nextAttrs) as Array<keyof typeof nextAttrs>) {
      if (currentAttrs[key as keyof typeof currentAttrs] !== nextAttrs[key]) {
        changed = true;
        break;
      }
    }

    if (changed) {
      updateAttributes(nextAttrs);
    }
  }, [imageEntity, imageNodeId, attrUploadId, attrPreviewId, attrSizePreset, attrAlignment, attrFileName, attrPreviewDataUrl, updateAttributes]);

  const { containerStyle, imageStyle, placeholderStyle, statusStyle, statusLabel } = useMemo(() => {
    const effectiveSizePreset = attrSizePreset || DEFAULT_IMAGE_PRESET;
    const effectiveAlignment = attrAlignment || DEFAULT_IMAGE_ALIGNMENT;

    // screenshot 类型：有 imageUrl，直接渲染
    if (isScreenshot) {
      const { containerStyle, imageStyle } = computeDisplayStyles(effectiveSizePreset, effectiveAlignment);
      return {
        containerStyle,
        imageStyle,
        placeholderStyle: placeholderImageStyle(),
        statusStyle: undefined,
        statusLabel: undefined
      };
    }

    // 从 Steam 图片池导入的图片（尚未注册到 useImageStore）
    if (steamPoolImage && !imageEntity) {
      const { containerStyle, imageStyle } = computeDisplayStyles(effectiveSizePreset, effectiveAlignment);
      return {
        containerStyle,
        imageStyle,
        placeholderStyle: placeholderImageStyle(),
        statusStyle: undefined,
        statusLabel: undefined
      };
    }

    // 从 useImageStore 获取的图片
    if (imageEntity) {
      const { containerStyle, imageStyle } = computeDisplayStyles(effectiveSizePreset, effectiveAlignment);

      // orphaned 状态：图片在 Steam 被删除
      if (imageEntity.status === "orphaned") {
        return {
          containerStyle,
          imageStyle: placeholderImageStyle(),
          placeholderStyle: orphanedPlaceholderStyle(),
          statusStyle: statusOverlayStyle("#ff8080"),
          statusLabel: `图片引用失效 (ID: ${imageEntity.steamPreviewId})`
        };
      }

      // BBCode 导入但没有可用 URL
      const hasAnyUrl = imageEntity.steamUrls?.originalUrl ||
                        imageEntity.steamUrls?.thumbnailUrl ||
                        imageEntity.localPreviewUrl;
      if (imageEntity.source === "bbcode" && !hasAnyUrl) {
        return {
          containerStyle,
          imageStyle: placeholderImageStyle(),
          placeholderStyle: orphanedPlaceholderStyle(),
          statusStyle: statusOverlayStyle("#ff8080"),
          statusLabel: `图片引用失效 (ID: ${imageEntity.steamPreviewId})`
        };
      }

      // 上传中 / 待上传 / 错误状态
      const statusConfig = resolveEntityStatus(imageEntity);

      return {
        containerStyle,
        imageStyle,
        placeholderStyle: placeholderImageStyle(),
        statusStyle: statusConfig?.style,
        statusLabel: statusConfig?.label
      };
    }

    // 只有 previewId 但没有任何数据（等待验证）
    if (attrPreviewId) {
      const { containerStyle } = computeDisplayStyles(effectiveSizePreset, effectiveAlignment);
      return {
        containerStyle,
        imageStyle: placeholderImageStyle(),
        placeholderStyle: orphanedPlaceholderStyle(),
        statusStyle: statusOverlayStyle("#808080"),
        statusLabel: `正在验证图片... (ID: ${attrPreviewId})`
      };
    }

    // 默认 fallback
    const { containerStyle } = computeDisplayStyles(DEFAULT_IMAGE_PRESET, DEFAULT_IMAGE_ALIGNMENT);
    return {
      containerStyle,
      imageStyle: placeholderImageStyle(),
      placeholderStyle: placeholderImageStyle(),
      statusStyle: undefined,
      statusLabel: "图片数据缺失"
    };
  }, [imageEntity, steamPoolImage, attrPreviewId, attrAlignment, attrSizePreset]);

  // 跟踪 CDN URL 是否加载失败，用于 fallback 到本地预览
  const [cdnUrlLoadFailed, setCdnUrlLoadFailed] = useState(false);

  useEffect(() => {
    setCdnUrlLoadFailed(false);
  }, [imageEntity?.steamUrls?.originalUrl]);

  const src = useMemo(() => {
    // screenshot 类型直接用 imageUrl
    // 对外链 URL 套 Steam 截断，使编辑器渲染 = Steam 实际渲染
    if (isScreenshot) {
      return simulateSteamUrlTruncation(attrImageUrl!).truncated;
    }

    const attrPreview = attrPreviewDataUrl ?? undefined;

    if (imageEntity) {
      const localPreviewUrl = imageEntity.localPreviewUrl ?? attrPreview;
      if (cdnUrlLoadFailed && localPreviewUrl) {
        return localPreviewUrl;
      }
      return (
        imageEntity.steamUrls?.originalUrl ??
        imageEntity.steamUrls?.thumbnailUrl ??
        localPreviewUrl
      );
    }

    if (steamPoolImage) {
      return steamPoolImage.originalUrl ?? steamPoolImage.thumbnailUrl;
    }

    return attrPreview;
  }, [imageEntity, steamPoolImage, attrPreviewDataUrl, cdnUrlLoadFailed, isScreenshot, attrImageUrl]);

  const handleImageLoad = useCallback(() => {
    if (imageEntity && imageEntity.status === "uploaded" && imageEntity.source === "bbcode") {
      useImageStore.getState().markSynced(imageEntity.id);
    }
  }, [imageEntity]);

  const handleImageLoadError = useCallback(() => {
    if (!cdnUrlLoadFailed && imageEntity?.steamUrls?.originalUrl) {
      setCdnUrlLoadFailed(true);
      return;
    }
    if (imageEntity && imageEntity.status === "uploaded" && imageEntity.source === "bbcode") {
      const hasLocalPreview = imageEntity.localPreviewUrl || attrPreviewDataUrl;
      if (!hasLocalPreview) {
        useImageStore.getState().markOrphaned(imageEntity.id);
      }
    }
  }, [cdnUrlLoadFailed, imageEntity, attrPreviewDataUrl]);

  const alt = imageEntity?.fileName ?? imageEntity?.originalName ?? steamPoolImage?.fileName ?? attrFileName ?? "NASGE 图片";

  // 获取图片状态（用于状态指示器）
  const imageState = useMemo(() => {
    if (imageEntity) {
      const hasAnyUrl = imageEntity.steamUrls?.originalUrl ||
                        imageEntity.steamUrls?.thumbnailUrl ||
                        imageEntity.localPreviewUrl;
      if (imageEntity.source === "bbcode" && !hasAnyUrl) {
        return "error";
      }

      switch (imageEntity.status) {
        case "local":
          return "pending";
        case "uploading":
          return "uploading";
        case "uploaded":
        case "synced":
          return "success";
        case "error":
        case "orphaned":
          return "error";
        default:
          return "pending";
      }
    }

    if (steamPoolImage) return "success";

    return null;
  }, [imageEntity, steamPoolImage]);

  const imageError = imageEntity?.error;

  // 右键直接拿当前 NodeView 的 pos(单 source of truth,不依赖容器层 posAtCoords + descendants 查找)
  // 派发自定义事件冒泡到容器层 useEffect listener,容器层根据 pos + attrs 打开菜单
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (typeof getPos !== "function") return;
    const pos = getPos();
    if (pos == null) return;
    e.preventDefault();
    e.stopPropagation();
    const customEvent = new CustomEvent("nasge-image-contextmenu", {
      bubbles: true,
      detail: { pos, attrs: node.attrs, clientX: e.clientX, clientY: e.clientY }
    });
    e.currentTarget.dispatchEvent(customEvent);
  }, [getPos, node.attrs]);

  return (
    <NodeViewWrapper
      as="div"
      className="nasge-image-node-wrapper"
      onContextMenu={handleContextMenu}
      data-preview-id={attrPreviewId ?? undefined}
      data-upload-id={undefined}
      data-image-node-id={imageNodeId ?? attrPreviewId ?? attrFileName ?? undefined}
      data-size-preset={attrSizePreset || "original"}
      data-alignment={attrAlignment || "inline"}
    >
      <div className="nasge-image-node" style={containerStyle}>
        {src ? (
          <>
            <img
              src={src}
              alt={alt}
              style={{
                ...imageStyle,
                ...(imageState && imageState !== "success" ? {
                  opacity: 0.5,
                  filter: "grayscale(30%)"
                } : {})
              }}
              draggable={false}
              onLoad={handleImageLoad}
              onError={handleImageLoadError}
            />
            {statusStyle && statusLabel ? (
              <div style={statusStyle}>{statusLabel}</div>
            ) : null}
          </>
        ) : (
          <div style={{
            ...placeholderStyle,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: "8px"
          }}>
            {statusLabel ? (
              <>
                <ImageIcon size={24} />
                <span style={{
                  color: imageEntity?.status === "orphaned" ? "#ff8080" : "#808080",
                  fontSize: "0.85rem",
                  textAlign: "center",
                  padding: "0 12px"
                }}>
                {statusLabel}
              </span>
            </>
          ) : (
            <span style={{ color: "#808080", fontSize: "0.85rem" }}>图片数据缺失</span>
          )}
        </div>
      )}

      </div>
    </NodeViewWrapper>
  );
};

/**
 * 统一的显示样式计算函数
 */
function computeDisplayStyles(
  sizePreset: string,
  alignment: string
): { containerStyle: React.CSSProperties; imageStyle: React.CSSProperties } {
  const isFloat = alignment === "floatLeft" || alignment === "floatRight";
  const isThumb = sizePreset === "thumb" || sizePreset === "half";
  const isFull = sizePreset === "full";

  const containerStyle: React.CSSProperties = {
    position: "relative",
    overflow: "hidden",
    padding: 0,
    verticalAlign: "baseline",
  };

  if (isFull) {
    containerStyle.display = "block";
    containerStyle.width = "100%";
    containerStyle.margin = "4px 6px 4px 0px";
  } else if (isThumb) {
    containerStyle.display = isFloat ? "block" : "inline-block";
    containerStyle.maxWidth = `${STEAM_THUMB_WIDTH}px`;
    if (isFloat) {
      containerStyle.float = alignment === "floatLeft" ? "left" : "right";
      containerStyle.margin = alignment === "floatLeft"
        ? "4px 6px 4px 0px"
        : "4px 0px 4px 6px";
    } else {
      containerStyle.margin = "0";
    }
  } else {
    containerStyle.display = isFloat ? "block" : "inline-block";
    containerStyle.maxWidth = "100%";
    if (isFloat) {
      containerStyle.float = alignment === "floatLeft" ? "left" : "right";
      containerStyle.margin = alignment === "floatLeft"
        ? "4px 6px 4px 0px"
        : "4px 0px 4px 6px";
    } else {
      containerStyle.margin = "0";
    }
  }

  const imageStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    height: "auto",
    maxWidth: "100%",
    userSelect: "none",
    objectFit: "fill",
    margin: 0,
  };

  return { containerStyle, imageStyle };
}

function placeholderImageStyle(widthPx?: number, heightPx?: number): React.CSSProperties {
  return {
    width: "100%",
    height: heightPx ? `${heightPx}px` : "200px",
    maxWidth: widthPx ? `${widthPx}px` : "320px",
    background: "rgba(14, 26, 40, 0.6)",
    border: "1px dashed rgba(102, 192, 244, 0.32)",
    display: "block"
  };
}

function orphanedPlaceholderStyle(): React.CSSProperties {
  return {
    width: "100%",
    height: "120px",
    maxWidth: "320px",
    background: "rgba(40, 14, 14, 0.6)",
    border: "1px dashed rgba(255, 128, 128, 0.5)",
    borderRadius: "8px",
    display: "block"
  };
}

/**
 * 根据 ImageEntity 状态生成状态覆盖层
 */
function resolveEntityStatus(
  entity: ImageEntity
): { style: React.CSSProperties; label: string } | null {
  if (entity.status === "uploading") {
    return {
      style: statusOverlayStyle("#66c0f4"),
      label: "上传中…"
    };
  }

  if (entity.status === "error") {
    return {
      style: statusOverlayStyle("#ff8080"),
      label: entity.error ?? "上传失败"
    };
  }

  if (entity.status === "local") {
    return {
      style: statusOverlayStyle("#d7e8ff"),
      label: "准备上传…"
    };
  }

  return null;
}

function statusOverlayStyle(color: string): React.CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(7, 12, 20, 0.65)",
    border: `1px solid ${color}33`,
    color,
    fontSize: "0.85rem",
    letterSpacing: "0.05em",
    pointerEvents: "none",
    padding: "0.5rem"
  };
}
