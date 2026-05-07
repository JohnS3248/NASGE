import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { useSteamGuideImageStore } from "../stores/useSteamGuideImageStore";
import { useImageStore } from "../stores/useImageStore";
import { useImageFromStore } from "../hooks/useImageFromStore";
import type { ImageSizePreset, ImageAlignment } from "../types/image";
import { DEFAULT_IMAGE_PRESET } from "../types/image";
import { ImageIcon } from "../components/ImageFloatingPanel/icons";
import { loggers } from "../../shared/logger";

// Steam 尺寸常量
const STEAM_CONTENT_WIDTH = 638;
const STEAM_THUMB_WIDTH = 311;

/**
 * 确保图片在 useImageStore 中有记录
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
          alignment: "inline" as ImageAlignment
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

/**
 * SteamImageInline - 内联图片节点
 * 与文字混排，不单独占行
 */
const SteamImageInline = Node.create({
  name: "steamImageInline",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

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
        default: "inline",
        renderHTML: (attributes) => ({
          "data-alignment": attributes.alignment
        }),
        parseHTML: (element) => element.getAttribute("data-alignment") || "inline"
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
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-nasge-image="inline"]',
        getAttrs: (element) => {
          if (typeof element === "string") return false;
          const el = element as HTMLElement;
          return {
            previewId: el.getAttribute("data-preview-id") || null,
            fileName: el.getAttribute("data-file-name") || null,
            sizePreset: el.getAttribute("data-size-preset") || DEFAULT_IMAGE_PRESET,
            alignment: el.getAttribute("data-alignment") || "inline",
            imageNodeId: el.getAttribute("data-image-node-id") || null
          };
        }
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(
        {
          "data-nasge-image": "inline"
        },
        HTMLAttributes
      )
    ];
  },

  addCommands() {
    return {
      insertSteamImageInline:
        (attrs: Record<string, unknown>) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              sizePreset: "original",
              alignment: "inline",
              ...attrs
            }
          })
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(SteamImageInlineNodeView);
  }
});

export default SteamImageInline;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    steamImageInline: {
      insertSteamImageInline: (attrs: Record<string, unknown>) => ReturnType;
    };
  }
}

/**
 * 内联图片节点视图组件
 */
const SteamImageInlineNodeView: React.FC<NodeViewProps> = ({
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

  const imageEntity = useImageFromStore(imageNodeId, attrPreviewId);

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

  // 确保图片在 Store 中
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

  // 同步属性
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

  // 计算样式
  const { containerStyle, imageStyle, statusLabel } = useMemo(() => {
    const effectiveSizePreset = attrSizePreset || DEFAULT_IMAGE_PRESET;

    const containerStyle: React.CSSProperties = {
      display: "inline",
      verticalAlign: "baseline",
      position: "relative",
    };

    const imageStyle: React.CSSProperties = {
      display: "inline",
      verticalAlign: "baseline",
    };

    if (effectiveSizePreset === "original") {
      imageStyle.maxWidth = "100%";
    } else if (effectiveSizePreset === "half") {
      imageStyle.maxWidth = `${STEAM_THUMB_WIDTH}px`;
    } else if (effectiveSizePreset === "full") {
      imageStyle.maxWidth = `${STEAM_CONTENT_WIDTH}px`;
    }

    let statusLabel: string | undefined;

    if (!imageEntity && !steamPoolImage) {
      if (attrPreviewId) {
        statusLabel = `验证中... (ID: ${attrPreviewId})`;
      } else {
        statusLabel = "图片数据缺失";
      }
    }

    if (imageEntity?.status === "orphaned") {
      statusLabel = `图片失效`;
    }

    const isUploaded = !!(attrPreviewId || imageEntity?.steamPreviewId);

    if (!isUploaded) {
      imageStyle.opacity = 0.5;
      imageStyle.filter = "grayscale(30%)";
    }

    return { containerStyle, imageStyle, statusLabel };
  }, [imageEntity, steamPoolImage, attrPreviewId, attrSizePreset]);

  // CDN URL fallback
  const [cdnUrlLoadFailed, setCdnUrlLoadFailed] = useState(false);

  useEffect(() => {
    setCdnUrlLoadFailed(false);
  }, [imageEntity?.steamUrls?.originalUrl]);

  const src = useMemo(() => {
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
  }, [imageEntity, steamPoolImage, attrPreviewDataUrl, cdnUrlLoadFailed]);

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

  const alt = imageEntity?.fileName ?? imageEntity?.originalName ?? steamPoolImage?.fileName ?? attrFileName ?? "内联图片";

  // 右键直接拿当前 NodeView 的 pos(同 SteamImage,详见 steamImage.tsx handleContextMenu 注释)
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
      as="span"
      className="nasge-image-inline-wrapper"
      onContextMenu={handleContextMenu}
      data-image-node-id={imageNodeId ?? attrPreviewId ?? attrFileName ?? undefined}
      data-preview-id={attrPreviewId ?? undefined}
      data-size-preset={attrSizePreset || "original"}
      style={{ display: "inline", verticalAlign: "baseline" }}
    >
      <span style={containerStyle}>
        {src ? (
          <img
            src={src}
            alt={alt}
            style={imageStyle}
            draggable={false}
            onLoad={handleImageLoad}
            onError={handleImageLoadError}
          />
        ) : (
          <span style={{
            display: "inline-block",
            width: "24px",
            height: "24px",
            background: "rgba(102, 192, 244, 0.2)",
            border: "1px dashed rgba(102, 192, 244, 0.5)",
            borderRadius: "4px",
            fontSize: "12px",
            lineHeight: "24px",
            textAlign: "center",
            color: "#66c0f4"
          }} title={statusLabel}>
            <ImageIcon size={16} />
          </span>
        )}
      </span>
    </NodeViewWrapper>
  );
};
