import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import type { CommandProps } from "@tiptap/core";
import {
  DEFAULT_IMAGE_ALIGNMENT,
  DEFAULT_IMAGE_PRESET,
  useEditorImageNodeStore
} from "../stores/useEditorImageNodeStore";
import type { EditorImageNode } from "../stores/useEditorImageNodeStore";
import { useSteamGuideImageStore } from "../stores/useSteamGuideImageStore";
// === 新 Store ===
import { useImageStore } from "../stores/useImageStore";
import type { ImageEntity, ImageSource, ImageSizePreset, ImageAlignment } from "../types/image";
import { loggers } from "../../shared/logger";

/**
 * 从新 Store 获取图片实体
 * 优先通过 sourceNodeId 查找（本地上传的图片）
 * 其次通过 steamPreviewId 查找（从 Steam 导入的图片）
 */
function useImageFromNewStore(
  imageNodeId: string | null,
  previewId: string | null
): ImageEntity | undefined {
  return useImageStore((state) => {
    // 优先通过 sourceNodeId 查找（映射到旧的 imageNodeId）
    if (imageNodeId) {
      const byNodeId = state.getImageBySourceNodeId(imageNodeId);
      if (byNodeId) return byNodeId;
    }

    // 其次通过 steamPreviewId 查找
    if (previewId) {
      const byPreviewId = state.getImageBySteamPreviewId(previewId);
      if (byPreviewId) return byPreviewId;
    }

    return undefined;
  });
}

/**
 * 将旧 Store 的 EditorImageNode 同步到新 Store
 * 用于双写模式下的数据迁移验证
 */
function syncToNewStore(
  imageNode: EditorImageNode | undefined,
  steamPoolImage: { previewId: string; fileName: string; thumbnailUrl?: string; originalUrl?: string } | undefined,
  attrPreviewId: string | null
): void {
  const newStore = useImageStore.getState();

  // 情况 1: 有 imageNode（本地上传的图片）
  if (imageNode) {
    // 检查新 Store 是否已有此图片（通过 sourceNodeId 去重）
    const existing = newStore.getImageBySourceNodeId(imageNode.nodeId);

    if (!existing) {
      // 映射 source（metadata.source 可能是 "paste" | "drop" | "clipboard" 等）
      const sourceMap: Record<string, ImageSource> = {
        paste: "paste",
        drop: "drop",
        clipboard: "paste",
        "file-input": "file-input",
        import: "steam-pool"
      };
      const metadataSource = imageNode.metadata.source ?? "paste";

      // 创建新图片实体
      const newImage = newStore.addLocalImage({
        fileName: imageNode.fileName ?? imageNode.originalName ?? "unknown",
        originalName: imageNode.originalName ?? "unknown",
        fileSize: imageNode.fileSize ?? 0,
        mimeType: "image/unknown", // EditorImageNode 不存储 mimeType
        source: sourceMap[metadataSource] ?? "paste",
        localPreviewUrl: imageNode.metadata.previewDataUrl,
        dimensions: imageNode.originalSize,
        display: {
          preset: imageNode.display.preset as ImageSizePreset,
          alignment: imageNode.display.alignment as ImageAlignment,
          customWidthPx: imageNode.display.customWidthPx
        }
      });

      // 设置 sourceNodeId 用于去重
      newStore.updateSourceNodeId(newImage.id, imageNode.nodeId);

      // 如果已有 previewId，更新状态
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

      loggers.image.verbose("SteamImage 同步到新 Store (from imageNode)", {
        oldNodeId: imageNode.nodeId,
        newImageId: newImage.id,
        status: newImage.status
      });
    }
    return;
  }

  // 情况 2: 有 steamPoolImage（从 Steam 导入的图片）
  if (steamPoolImage) {
    const existing = newStore.getImageBySteamPreviewId(steamPoolImage.previewId);
    if (!existing) {
      const newImage = newStore.importFromSteamPool({
        steamPreviewId: steamPoolImage.previewId,
        fileName: steamPoolImage.fileName,
        thumbnailUrl: steamPoolImage.thumbnailUrl,
        originalUrl: steamPoolImage.originalUrl
      });
      loggers.image.verbose("SteamImage 同步到新 Store (from steamPool)", {
        previewId: steamPoolImage.previewId,
        newImageId: newImage.id
      });
    }
    return;
  }

  // 情况 3: 只有 previewId（从 BBCode 导入但图片池中不存在）
  if (attrPreviewId) {
    const existing = newStore.getImageBySteamPreviewId(attrPreviewId);
    if (!existing) {
      const newImage = newStore.importFromBBCode({
        steamPreviewId: attrPreviewId,
        fileName: `image-${attrPreviewId}`
      });
      loggers.image.verbose("SteamImage 同步到新 Store (from BBCode, orphaned)", {
        previewId: attrPreviewId,
        newImageId: newImage.id,
        status: "uploaded (待验证)"
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
          parseHTML: (element) => element.getAttribute("data-size-preset") || DEFAULT_IMAGE_PRESET
        },
        alignment: {
          default: DEFAULT_IMAGE_ALIGNMENT,
          renderHTML: (attributes) => ({
            "data-alignment": attributes.alignment
          }),
          parseHTML: (element) => element.getAttribute("data-alignment") || DEFAULT_IMAGE_ALIGNMENT
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
          // previewDataUrl 不需要渲染到 HTML，只在编辑器内部使用
          renderHTML: () => ({}),
          parseHTML: () => null
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
              imageNodeId: el.getAttribute("data-image-node-id") || null
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
  updateAttributes
}) => {
  const imageNodeId = node.attrs.imageNodeId as string | null;
  const attrPreviewId = node.attrs.previewId as string | null;

  // === 新 Store 读取（主要数据源）===
  const imageEntity = useImageFromNewStore(imageNodeId, attrPreviewId);

  // === 旧 Store 读取（用于双写同步和过渡期兼容）===
  const imageNode = useEditorImageNodeStore(
    (state) => (imageNodeId ? state.nodes[imageNodeId] : undefined)
  );

  // 从 Steam 图片池中查找图片（用于双写同步）
  const steamPoolImage = useSteamGuideImageStore(
    (state) => {
      if (imageNode) return undefined;
      if (!attrPreviewId) return undefined;
      return state.items.find((item) => item.previewId === attrPreviewId);
    }
  );

  // === 双写模式：确保数据同步到新 Store ===
  const hasSyncedRef = useRef(false);
  useEffect(() => {
    // 如果新 Store 已有数据，跳过同步
    if (imageEntity) {
      hasSyncedRef.current = true;
      return;
    }

    // 只同步一次
    if (hasSyncedRef.current) return;

    // 等待有数据可同步
    if (!imageNode && !steamPoolImage && !attrPreviewId) return;

    hasSyncedRef.current = true;
    syncToNewStore(imageNode, steamPoolImage, attrPreviewId);
  }, [imageEntity, imageNode, steamPoolImage, attrPreviewId]);
  // === END 双写模式 ===

  useEffect(() => {
    if (!imageNodeId || imageNode) {
      return;
    }

    // 如果有 previewId 且能从图片池找到，不需要警告
    if (attrPreviewId && steamPoolImage) {
      return;
    }

    if (!node.attrs.previewDataUrl && !attrPreviewId) {
      loggers.image.warn("steamImage 节点缺少关联数据", {
        imageNodeId,
        attrPreviewId,
        nodes: useEditorImageNodeStore.getState().nodes
      });
    }
  }, [imageNode, imageNodeId, node.attrs.previewDataUrl, attrPreviewId, steamPoolImage]);

  // 移除自动清理逻辑：节点的删除应该由编辑器的 deleteSelection 命令触发
  // 不应该在组件卸载时自动删除 store 数据，因为 TipTap 会在内容更新时重新挂载组件
  // 这会导致节点被意外删除

  useEffect(() => {
    // 优先从新 Store 读取 previewId，兼容旧 Store
    const effectivePreviewId =
      imageEntity?.steamPreviewId ?? imageNode?.previewId ?? null;

    // 如果没有任何数据源，跳过
    if (!imageNode && !imageEntity) {
      return;
    }

    const nextAttrs = {
      imageNodeId: imageNode?.nodeId ?? imageEntity?.sourceNodeId ?? null,
      uploadId: imageNode?.uploadId ?? null,
      // 新 Store 优先：确保上传成功后 previewId 能正确同步到 TipTap 节点
      previewId: effectivePreviewId,
      sizePreset: imageEntity?.display.preset ?? imageNode?.display.preset ?? "original",
      alignment: imageEntity?.display.alignment ?? imageNode?.display.alignment ?? "inline",
      fileName: imageNode?.fileName ?? imageNode?.originalName ?? imageEntity?.fileName ?? null,
      previewDataUrl: imageNode?.metadata.previewDataUrl ?? imageEntity?.localPreviewUrl ?? null
    };

    let changed = false;
    for (const key of Object.keys(nextAttrs) as Array<keyof typeof nextAttrs>) {
      if (node.attrs[key] !== nextAttrs[key]) {
        changed = true;
        break;
      }
    }

    if (changed) {
      updateAttributes(nextAttrs);
    }
  }, [imageNode, imageEntity, node.attrs, updateAttributes]);

  const { containerStyle, imageStyle, placeholderStyle, statusStyle, statusLabel } = useMemo(() => {
    // 获取节点属性中的对齐和尺寸设置
    const attrAlignment = (node.attrs.alignment as string) || DEFAULT_IMAGE_ALIGNMENT;
    const attrSizePreset = (node.attrs.sizePreset as string) || DEFAULT_IMAGE_PRESET;

    if (!imageNode) {
      // 如果有 steamPoolImage，说明是从 Steam 导入的图片，应该正常显示
      if (steamPoolImage) {
        return {
          containerStyle: baseContainerStyle(attrAlignment, undefined, "inline-auto"),
          imageStyle: {
            display: "block",
            width: "100%",
            height: "auto",
            maxWidth: "100%",
            userSelect: "none" as const,
            pointerEvents: "none" as const,
            objectFit: "contain" as const,
            margin: "0 !important" as any
          },
          placeholderStyle: placeholderImageStyle(),
          statusStyle: undefined,
          statusLabel: undefined // 已上传的图片不需要状态标签
        };
      }

      // 如果有 imageEntity（从新 Store），根据状态显示
      if (imageEntity) {
        // orphaned 状态：图片在 Steam 被删除
        if (imageEntity.status === "orphaned") {
          return {
            containerStyle: baseContainerStyle(attrAlignment, undefined, "inline-auto"),
            imageStyle: placeholderImageStyle(),
            placeholderStyle: orphanedPlaceholderStyle(),
            statusStyle: statusOverlayStyle("#ff8080"),
            statusLabel: `图片引用失效 (ID: ${imageEntity.steamPreviewId})`
          };
        }
        // 其他状态（uploaded/synced）但没有 URL 时
        return {
          containerStyle: baseContainerStyle(attrAlignment, undefined, "inline-auto"),
          imageStyle: placeholderImageStyle(),
          placeholderStyle: placeholderImageStyle(),
          statusStyle: undefined,
          statusLabel: undefined
        };
      }

      // 只有 previewId 但没有任何数据（等待验证）
      if (attrPreviewId) {
        return {
          containerStyle: baseContainerStyle(attrAlignment, undefined, "inline-auto"),
          imageStyle: placeholderImageStyle(),
          placeholderStyle: orphanedPlaceholderStyle(),
          statusStyle: statusOverlayStyle("#808080"),
          statusLabel: `正在验证图片... (ID: ${attrPreviewId})`
        };
      }

      return {
        containerStyle: baseContainerStyle(DEFAULT_IMAGE_ALIGNMENT, undefined, "inline-auto"),
        imageStyle: placeholderImageStyle(),
        placeholderStyle: placeholderImageStyle(),
        statusStyle: undefined,
        statusLabel: "图片数据缺失"
      };
    }

    const dims = resolveRenderDimensions(imageNode);
    const container = baseContainerStyle(imageNode.display.alignment, dims.containerWidthPx, dims.mode);
    const image = resolveImageStyle(dims);
    const placeholder = placeholderImageStyle(dims.containerWidthPx, dims.estimatedHeightPx);

    const statusConfig = resolveStatus(imageNode.status, imageNode.error);

    return {
      containerStyle: container,
      imageStyle: image,
      placeholderStyle: placeholder,
      statusStyle: statusConfig?.style,
      statusLabel: statusConfig?.label
    };
  }, [imageNode, imageEntity, steamPoolImage, attrPreviewId, node.attrs.alignment, node.attrs.sizePreset]);

  // 跟踪 CDN URL 是否加载失败，用于 fallback 到本地预览
  const [cdnUrlLoadFailed, setCdnUrlLoadFailed] = useState(false);

  // 当 imageNode 变化时重置 fallback 状态
  useEffect(() => {
    setCdnUrlLoadFailed(false);
  }, [imageNode?.cdnUrl]);

  const src = useMemo(() => {
    const attrPreview = (node.attrs.previewDataUrl as string | null) ?? undefined;

    // === 优先使用新 Store 的 imageEntity ===
    if (imageEntity) {
      // 获取本地预览 URL（fallback 选项）
      const localPreviewUrl = imageEntity.localPreviewUrl ?? attrPreview;

      // 如果 CDN URL 加载失败，回退到本地预览
      if (cdnUrlLoadFailed && localPreviewUrl) {
        loggers.image.verbose('CDN URL 加载失败，回退到本地预览');
        return localPreviewUrl;
      }

      // URL 优先级：Steam URLs > 本地预览
      return (
        imageEntity.steamUrls?.originalUrl ??
        imageEntity.steamUrls?.thumbnailUrl ??
        localPreviewUrl
      );
    }

    // === 兼容模式：旧 Store 数据 ===
    // 情况1：有 imageNode（本地上传的图片）
    if (imageNode) {
      const localPreviewUrl = imageNode.metadata.previewDataUrl ?? attrPreview;
      if (cdnUrlLoadFailed && localPreviewUrl) {
        loggers.image.verbose('CDN URL 加载失败，回退到本地预览');
        return localPreviewUrl;
      }
      return imageNode.cdnUrl ?? localPreviewUrl;
    }

    // 情况2：有 steamPoolImage（从 Steam BBCode 导入的图片）
    if (steamPoolImage) {
      return steamPoolImage.originalUrl ?? steamPoolImage.thumbnailUrl;
    }

    // 情况3：没有任何数据源
    return attrPreview;
  }, [imageEntity, imageNode, steamPoolImage, node.attrs.previewDataUrl, cdnUrlLoadFailed]);

  // 处理图片加载失败
  const handleImageLoadError = useCallback(() => {
    if (imageNode?.cdnUrl && !cdnUrlLoadFailed) {
      loggers.image.warn('CDN URL 加载失败，尝试回退到本地预览:', imageNode.cdnUrl);
      setCdnUrlLoadFailed(true);
    }
  }, [imageNode?.cdnUrl, cdnUrlLoadFailed]);

  const alt = imageEntity?.fileName ?? imageEntity?.originalName ?? imageNode?.fileName ?? imageNode?.originalName ?? steamPoolImage?.fileName ?? (node.attrs.fileName as string) ?? "NASGE 图片";

  // 获取图片状态（用于状态指示器）
  const imageState = useMemo(() => {
    // === 优先使用新 Store 的 imageEntity ===
    if (imageEntity) {
      switch (imageEntity.status) {
        case "local":
          return "pending";
        case "uploading":
          return "uploading";
        case "uploaded":
        case "synced":
          return "success";
        case "error":
          return "error";
        case "orphaned":
          return "error"; // orphaned 视为错误状态
        default:
          return "pending";
      }
    }

    // === 兼容模式：旧 Store 数据 ===
    if (steamPoolImage) return "success";

    if (!imageNode) return null;

    if (imageNode.status === "uploading") return "uploading";
    if (imageNode.status === "error") return "error";
    if (imageNode.status === "intake") return "pending";
    if (imageNode.previewId) return "success";

    return "pending";
  }, [imageEntity, imageNode, steamPoolImage]);

  // 获取错误信息（用于状态指示器）
  const imageError = imageEntity?.error ?? imageNode?.error;

  return (
    <NodeViewWrapper
      as="div"
      className="nasge-image-node"
      data-preview-id={imageNode?.previewId}
      data-upload-id={imageNode?.uploadId}
      data-image-node-id={imageNode?.nodeId ?? (node.attrs.imageNodeId as string | null) ?? undefined}
      style={containerStyle}
    >
      {src ? (
        <>
          <img
            src={src}
            alt={alt}
            style={imageStyle}
            draggable={false}
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
              <span style={{ fontSize: "24px" }}>🖼️</span>
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

      {/* 状态指示器（圆形图标） */}
      {imageState && <StateIndicator state={imageState} error={imageError} />}
    </NodeViewWrapper>
  );
};

/**
 * 状态指示器组件（圆形图标）
 */
const StateIndicator: React.FC<{ state: string; error?: string }> = ({ state, error }) => {
  const config = useMemo(() => {
    switch (state) {
      case "pending":
        return {
          color: "#808080", // 灰色
          label: "未上传",
          icon: "○"
        };
      case "uploading":
        return {
          color: "#FFC107", // 黄色
          label: "上传中...",
          icon: "◐"
        };
      case "success":
        return {
          color: "#4CAF50", // 绿色
          label: "已上传",
          icon: "●"
        };
      case "error":
        return {
          color: "#F44336", // 红色
          label: error || "上传失败",
          icon: "✕"
        };
      default:
        return null;
    }
  }, [state, error]);

  if (!config) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: "8px",
        right: "8px",
        width: "24px",
        height: "24px",
        borderRadius: "50%",
        backgroundColor: config.color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontSize: "14px",
        fontWeight: "bold",
        boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
        cursor: "help",
        zIndex: 10
      }}
      title={config.label}
    >
      {config.icon}
    </div>
  );
};

type WidthMode = "natural" | "fixed" | "full" | "inline-auto";

function baseContainerStyle(
  alignment: string,
  widthPx?: number,
  widthMode: WidthMode = "fixed"
): React.CSSProperties {
  const base: React.CSSProperties = {
    display: widthMode === "full" ? "block" : "inline-block",
    margin:
      widthMode === "full"
        ? "1rem 0"
        : widthMode === "inline-auto"
          ? "0 0.45rem 0.35rem 0"
          : "0.75rem 1rem 0.75rem 0",
    padding: 0,
    overflow: "hidden",
    position: "relative",
    verticalAlign: "top",
    // 添加最大宽度限制，防止图片过大撑破布局
    maxWidth: "100%"
  };

  if (widthMode === "full") {
    base.width = "100%";
  } else if (typeof widthPx === "number" && widthPx > 0) {
    base.width = `${widthPx}px`;
    // 确保容器不会超过父容器宽度
    base.maxWidth = "100%";
  }

  if (alignment === "floatLeft") {
    return {
      ...base,
      float: "left"
    };
  }

  if (alignment === "floatRight") {
    return {
      ...base,
      float: "right",
      margin: "0.75rem 0 0.75rem 1rem"
    };
  }

  return {
    ...base,
    float: "none"
  };
}

function resolveImageStyle(dimensions: RenderDimensions): React.CSSProperties {
  const commonStyles: React.CSSProperties = {
    display: "block",
    height: "auto",
    maxWidth: "100%",
    userSelect: "none",
    pointerEvents: "none",
    // 确保图片保持原始宽高比
    objectFit: "contain",
    // 覆盖prose等全局样式
    margin: "0 !important" as any,
    // 确保图片宽度不会溢出容器
    width: "100%"
  };

  if (dimensions.mode === "full") {
    return {
      ...commonStyles,
      width: "100%"
    };
  }

  if (dimensions.mode === "fixed" && typeof dimensions.imageWidthPx === "number") {
    return {
      ...commonStyles,
      width: "100%"
    };
  }

  return {
    ...commonStyles,
    width: "100%"
  };
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

/**
 * 失效图片引用的占位符样式（红色边框）
 */
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

type RenderDimensions = {
  mode: WidthMode;
  imageWidthPx?: number;
  containerWidthPx?: number;
  estimatedHeightPx?: number;
};

function resolveRenderDimensions(imageNode: EditorImageNode): RenderDimensions {
  const intrinsicWidth = imageNode.originalSize?.width;
  const intrinsicHeight = imageNode.originalSize?.height;

  if (
    typeof imageNode.display.customWidthPx === "number" &&
    imageNode.display.customWidthPx > 0 &&
    intrinsicWidth &&
    intrinsicHeight
  ) {
    const widthPx = imageNode.display.customWidthPx;
    const ratio = intrinsicHeight / intrinsicWidth;
    return {
      mode: "fixed",
      imageWidthPx: widthPx,
      containerWidthPx: widthPx,
      estimatedHeightPx: Math.round(widthPx * ratio)
    };
  }

  if (!intrinsicWidth || !intrinsicHeight) {
    return {
      mode: "inline-auto"
    };
  }

  switch (imageNode.display.preset) {
    case "full":
      return {
        mode: "full"
      };
    case "half": {
      const widthPx = Math.max(1, Math.round(intrinsicWidth / 2));
      const heightPx = Math.max(1, Math.round(intrinsicHeight / 2));
      return {
        mode: "fixed",
        imageWidthPx: widthPx,
        containerWidthPx: widthPx,
        estimatedHeightPx: heightPx
      };
    }
    case "thumb": {
      const widthPx = 260;
      const heightPx = Math.max(1, Math.round((intrinsicHeight / intrinsicWidth) * widthPx));
      return {
        mode: "fixed",
        imageWidthPx: widthPx,
        containerWidthPx: widthPx,
        estimatedHeightPx: heightPx
      };
    }
    case "original":
    default: {
      // 对于原尺寸，我们设置容器宽度为原始宽度
      // 但由于容器有 maxWidth: 100%，实际不会超出父容器
      // 图片本身设置 width: 100%，会自动适配容器大小并保持宽高比
      return {
        mode: "fixed",
        imageWidthPx: intrinsicWidth,
        containerWidthPx: intrinsicWidth,
        estimatedHeightPx: intrinsicHeight
      };
    }
  }
}

function resolveStatus(
  status: string,
  error?: string
): { style: React.CSSProperties; label: string } | null {
  if (status === "uploading") {
    return {
      style: statusOverlayStyle("#66c0f4"),
      label: "上传中…"
    };
  }

  if (status === "error") {
    return {
      style: statusOverlayStyle("#ff8080"),
      label: error ?? "上传失败"
    };
  }

  if (status === "intake") {
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
