import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import {
  DEFAULT_IMAGE_PRESET,
  useEditorImageNodeStore
} from "../stores/useEditorImageNodeStore";
import type { EditorImageNode } from "../stores/useEditorImageNodeStore";
import { useSteamGuideImageStore } from "../stores/useSteamGuideImageStore";
import { useImageStore } from "../stores/useImageStore";
import type { ImageEntity, ImageSource, ImageSizePreset, ImageAlignment } from "../types/image";
import { loggers } from "../../shared/logger";

// Steam 尺寸常量 (来自 Steam 实际测量 2025-12-31，与 steamImage.tsx 保持一致)
const STEAM_CONTENT_WIDTH = 638;
const STEAM_THUMB_WIDTH = 311;

/**
 * 从新 Store 获取图片实体
 */
function useImageFromNewStore(
  imageNodeId: string | null,
  previewId: string | null
): ImageEntity | undefined {
  return useImageStore((state) => {
    if (imageNodeId) {
      const byNodeId = state.getImageBySourceNodeId(imageNodeId);
      if (byNodeId) return byNodeId;
    }
    if (previewId) {
      const byPreviewId = state.getImageBySteamPreviewId(previewId);
      if (byPreviewId) return byPreviewId;
    }
    return undefined;
  });
}

/**
 * 将旧 Store 的 EditorImageNode 同步到新 Store
 */
function syncToNewStore(
  imageNode: EditorImageNode | undefined,
  steamPoolImage: { previewId: string; fileName: string; thumbnailUrl?: string; originalUrl?: string } | undefined,
  attrPreviewId: string | null,
  displaySettings?: { preset?: string; alignment?: string }
): void {
  const newStore = useImageStore.getState();

  if (imageNode) {
    const existing = newStore.getImageBySourceNodeId(imageNode.nodeId);
    if (!existing) {
      const sourceMap: Record<string, ImageSource> = {
        paste: "paste",
        drop: "drop",
        clipboard: "paste",
        "file-input": "file-input",
        import: "steam-pool"
      };
      const metadataSource = imageNode.metadata.source ?? "paste";

      const newImage = newStore.addLocalImage({
        fileName: imageNode.fileName ?? imageNode.originalName ?? "unknown",
        originalName: imageNode.originalName ?? "unknown",
        fileSize: imageNode.fileSize ?? 0,
        mimeType: "image/unknown",
        source: sourceMap[metadataSource] ?? "paste",
        localPreviewUrl: imageNode.metadata.previewDataUrl,
        dimensions: imageNode.originalSize,
        display: {
          preset: imageNode.display.preset as ImageSizePreset,
          alignment: "inline" as ImageAlignment,
          customWidthPx: imageNode.display.customWidthPx
        }
      });

      newStore.updateSourceNodeId(newImage.id, imageNode.nodeId);

      if (imageNode.previewId) {
        newStore.markUploaded(newImage.id, imageNode.previewId, {
          thumbnailUrl: imageNode.cdnUrl,
          originalUrl: imageNode.cdnUrl
        });
      } else if (imageNode.status === "uploading") {
        newStore.markUploading(newImage.id);
      } else if (imageNode.status === "error") {
        newStore.markError(newImage.id, imageNode.error ?? "Unknown error");
      }

      loggers.image.verbose("SteamImageInline 同步到新 Store (from imageNode)", {
        oldNodeId: imageNode.nodeId,
        newImageId: newImage.id,
        status: newImage.status
      });
    }
    return;
  }

  if (steamPoolImage) {
    const existing = newStore.getImageBySteamPreviewId(steamPoolImage.previewId);
    if (!existing) {
      const newImage = newStore.importFromSteamPool({
        steamPreviewId: steamPoolImage.previewId,
        fileName: steamPoolImage.fileName,
        thumbnailUrl: steamPoolImage.thumbnailUrl,
        originalUrl: steamPoolImage.originalUrl,
        display: displaySettings ? {
          preset: displaySettings.preset as ImageSizePreset,
          alignment: "inline" as ImageAlignment
        } : undefined
      });
      loggers.image.verbose("SteamImageInline 同步到新 Store (from steamPool)", {
        previewId: steamPoolImage.previewId,
        newImageId: newImage.id,
        display: displaySettings
      });
    }
    return;
  }

  if (attrPreviewId) {
    const existing = newStore.getImageBySteamPreviewId(attrPreviewId);
    if (!existing) {
      const newImage = newStore.importFromBBCode({
        steamPreviewId: attrPreviewId,
        fileName: `image-${attrPreviewId}`
      });
      loggers.image.verbose("SteamImageInline 同步到新 Store (from BBCode, orphaned)", {
        previewId: attrPreviewId,
        newImageId: newImage.id,
        status: "uploaded (待验证)"
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
  draggable: false, // 内联节点不支持拖拽

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

  addNodeView() {
    return ReactNodeViewRenderer(SteamImageInlineNodeView);
  }
});

export default SteamImageInline;

/**
 * 内联图片节点视图组件
 */
const SteamImageInlineNodeView: React.FC<NodeViewProps> = ({
  node,
  updateAttributes
}) => {
  const imageNodeId = node.attrs.imageNodeId as string | null;
  const attrPreviewId = node.attrs.previewId as string | null;
  const attrSizePreset = node.attrs.sizePreset as string | null;
  const attrAlignment = node.attrs.alignment as string | null;
  const attrUploadId = node.attrs.uploadId as string | null;
  const attrFileName = node.attrs.fileName as string | null;
  const attrPreviewDataUrl = node.attrs.previewDataUrl as string | null;

  // 新 Store 读取
  const imageEntity = useImageFromNewStore(imageNodeId, attrPreviewId);

  // 旧 Store 读取（兼容）
  const imageNode = useEditorImageNodeStore(
    (state) => (imageNodeId ? state.nodes[imageNodeId] : undefined)
  );

  // Steam 图片池
  const steamPoolImage = useSteamGuideImageStore(
    (state) => {
      if (imageNode) return undefined;
      if (!attrPreviewId) return undefined;
      return state.items.find((item) => item.previewId === attrPreviewId);
    }
  );

  // 双写同步
  const hasSyncedRef = useRef(false);
  useEffect(() => {
    if (imageEntity) {
      hasSyncedRef.current = true;
      return;
    }
    if (hasSyncedRef.current) return;
    if (!imageNode && !steamPoolImage && !attrPreviewId) return;

    hasSyncedRef.current = true;
    syncToNewStore(imageNode, steamPoolImage, attrPreviewId, {
      preset: attrSizePreset as string,
      alignment: attrAlignment as string
    });
  }, [imageEntity, imageNode, steamPoolImage, attrPreviewId, attrSizePreset, attrAlignment]);

  // 同步属性
  useEffect(() => {
    const effectivePreviewId =
      imageEntity?.steamPreviewId ?? imageNode?.previewId ?? null;

    if (!imageNode && !imageEntity) {
      return;
    }

    const nextAttrs = {
      imageNodeId: imageNode?.nodeId ?? imageEntity?.sourceNodeId ?? null,
      uploadId: imageNode?.uploadId ?? null,
      previewId: effectivePreviewId,
      sizePreset: attrSizePreset ?? imageEntity?.display.preset ?? imageNode?.display.preset ?? "original",
      alignment: attrAlignment ?? imageNode?.display.alignment ?? imageEntity?.display.alignment ?? "inline",
      fileName: imageNode?.fileName ?? imageNode?.originalName ?? imageEntity?.fileName ?? null,
      previewDataUrl: imageNode?.metadata.previewDataUrl ?? imageEntity?.localPreviewUrl ?? null
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
  }, [imageNode, imageEntity, imageNodeId, attrUploadId, attrPreviewId, attrSizePreset, attrAlignment, attrFileName, attrPreviewDataUrl, updateAttributes]);

  // 计算样式
  const { containerStyle, imageStyle, statusLabel } = useMemo(() => {
    const effectiveSizePreset = attrSizePreset || DEFAULT_IMAGE_PRESET;

    // 内联图片容器样式 - 参考 Steam 官方渲染
    // Steam 实际行为：使用 baseline（默认值），而非文档声称的 middle
    const containerStyle: React.CSSProperties = {
      display: "inline",
      verticalAlign: "baseline",
      position: "relative",
    };

    // 图片样式 - 严格按照 Steam CSS 规则
    // Steam CSS: .sharedFilePreviewImage { max-width: 100%; }
    // sizeOriginal = 原始尺寸，不加额外限制
    // sizeThumb = max-width: 311px (STEAM_THUMB_WIDTH)
    // sizeFull = max-width: 638px (STEAM_CONTENT_WIDTH)
    const imageStyle: React.CSSProperties = {
      display: "inline",
      verticalAlign: "baseline",
    };

    // 根据 preset 设置尺寸限制（与 steamImage.tsx 保持一致）
    if (effectiveSizePreset === "original") {
      // sizeOriginal: 原始尺寸，仅限制不超过内容区宽度
      imageStyle.maxWidth = "100%";
    } else if (effectiveSizePreset === "half") {
      // sizeThumb: 缩略图模式，max-width: 311px
      imageStyle.maxWidth = `${STEAM_THUMB_WIDTH}px`;
    } else if (effectiveSizePreset === "full") {
      // sizeFull: 全宽模式，max-width: 638px
      imageStyle.maxWidth = `${STEAM_CONTENT_WIDTH}px`;
    }

    let statusLabel: string | undefined;

    if (!imageNode && !imageEntity && !steamPoolImage) {
      if (attrPreviewId) {
        statusLabel = `验证中... (ID: ${attrPreviewId})`;
      } else {
        statusLabel = "图片数据缺失";
      }
    }

    if (imageEntity?.status === "orphaned") {
      statusLabel = `图片失效`;
    }

    // 计算上传状态：有 previewId 表示已上传
    const isUploaded = !!(attrPreviewId || imageNode?.previewId || imageEntity?.steamPreviewId);

    // 未上传状态使用低亮度
    if (!isUploaded) {
      imageStyle.opacity = 0.5;
      imageStyle.filter = "grayscale(30%)";
    }

    return { containerStyle, imageStyle, statusLabel };
  }, [imageNode, imageEntity, steamPoolImage, attrPreviewId, attrSizePreset]);

  // CDN URL fallback
  const [cdnUrlLoadFailed, setCdnUrlLoadFailed] = useState(false);

  useEffect(() => {
    setCdnUrlLoadFailed(false);
  }, [imageNode?.cdnUrl]);

  // 图片 URL
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

    if (imageNode) {
      const localPreviewUrl = imageNode.metadata.previewDataUrl ?? attrPreview;
      if (cdnUrlLoadFailed && localPreviewUrl) {
        return localPreviewUrl;
      }
      return imageNode.cdnUrl ?? localPreviewUrl;
    }

    if (steamPoolImage) {
      return steamPoolImage.originalUrl ?? steamPoolImage.thumbnailUrl;
    }

    return attrPreview;
  }, [imageEntity, imageNode, steamPoolImage, attrPreviewDataUrl, cdnUrlLoadFailed]);

  const handleImageLoad = useCallback(() => {
    if (imageEntity && imageEntity.status === "uploaded" && imageEntity.source === "bbcode") {
      useImageStore.getState().markSynced(imageEntity.id);
    }
  }, [imageEntity]);

  const handleImageLoadError = useCallback(() => {
    if (imageNode?.cdnUrl && !cdnUrlLoadFailed) {
      setCdnUrlLoadFailed(true);
      return;
    }
    if (imageEntity && imageEntity.status === "uploaded" && imageEntity.source === "bbcode") {
      const hasLocalPreview = imageEntity.localPreviewUrl || attrPreviewDataUrl;
      if (!hasLocalPreview) {
        useImageStore.getState().markOrphaned(imageEntity.id);
      }
    }
  }, [imageNode?.cdnUrl, cdnUrlLoadFailed, imageEntity, attrPreviewDataUrl]);

  const alt = imageEntity?.fileName ?? imageEntity?.originalName ?? imageNode?.fileName ?? imageNode?.originalName ?? steamPoolImage?.fileName ?? attrFileName ?? "内联图片";

  return (
    <NodeViewWrapper
      as="span"
      className="nasge-image-inline-wrapper"
      data-image-node-id={imageNodeId ?? attrPreviewId ?? imageNode?.previewId}
      data-preview-id={attrPreviewId ?? imageNode?.previewId}
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
            🖼
          </span>
        )}
      </span>
    </NodeViewWrapper>
  );
};
