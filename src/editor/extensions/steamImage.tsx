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

// Steam 尺寸常量 (来自 Steam 实际测量 2025-12-31)
const STEAM_CONTENT_WIDTH = 638;
const STEAM_THUMB_WIDTH = 311;

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
  attrPreviewId: string | null,
  displaySettings?: { preset?: string; alignment?: string }
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
        originalUrl: steamPoolImage.originalUrl,
        // 传递显示设置，保留 BBCode 导入时的预设
        display: displaySettings ? {
          preset: displaySettings.preset as ImageSizePreset,
          alignment: displaySettings.alignment as ImageAlignment
        } : undefined
      });
      loggers.image.verbose("SteamImage 同步到新 Store (from steamPool)", {
        previewId: steamPoolImage.previewId,
        newImageId: newImage.id,
        display: displaySettings
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
          // 必须定义 parseHTML：TipTap 不会自动从 getAttrs 继承值
          // 如果不定义，属性会回退到 default 值
          parseHTML: (element) => element.getAttribute("data-size-preset")
        },
        alignment: {
          default: DEFAULT_IMAGE_ALIGNMENT,
          renderHTML: (attributes) => ({
            "data-alignment": attributes.alignment
          }),
          // 必须定义 parseHTML：TipTap 不会自动从 getAttrs 继承值
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
  // 提取所有需要的 node.attrs 属性，避免整个对象作为依赖
  const imageNodeId = node.attrs.imageNodeId as string | null;
  const attrPreviewId = node.attrs.previewId as string | null;
  const attrSizePreset = node.attrs.sizePreset as string | null;
  const attrAlignment = node.attrs.alignment as string | null;
  const attrUploadId = node.attrs.uploadId as string | null;
  const attrFileName = node.attrs.fileName as string | null;
  const attrPreviewDataUrl = node.attrs.previewDataUrl as string | null;

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
    // 传递 node.attrs 中的显示设置，保留 BBCode 导入时的预设
    syncToNewStore(imageNode, steamPoolImage, attrPreviewId, {
      preset: attrSizePreset as string,
      alignment: attrAlignment as string
    });
  }, [imageEntity, imageNode, steamPoolImage, attrPreviewId, attrSizePreset, attrAlignment]);
  // === END 双写模式 ===

  useEffect(() => {
    if (!imageNodeId || imageNode) {
      return;
    }

    // 如果有 previewId 且能从图片池找到，不需要警告
    if (attrPreviewId && steamPoolImage) {
      return;
    }

    if (!attrPreviewDataUrl && !attrPreviewId) {
      loggers.image.warn("steamImage 节点缺少关联数据", {
        imageNodeId,
        attrPreviewId,
        nodes: useEditorImageNodeStore.getState().nodes
      });
    }
  }, [imageNode, imageNodeId, attrPreviewDataUrl, attrPreviewId, steamPoolImage]);

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
      // node.attrs 优先：BBCode 解析的值不应被 store 的默认值覆盖
      // 只有当 node.attrs 没有值时才使用 store 的值
      sizePreset: attrSizePreset ?? imageEntity?.display.preset ?? imageNode?.display.preset ?? "original",
      alignment: attrAlignment ?? imageEntity?.display.alignment ?? imageNode?.display.alignment ?? "inline",
      fileName: imageNode?.fileName ?? imageNode?.originalName ?? imageEntity?.fileName ?? null,
      previewDataUrl: imageNode?.metadata.previewDataUrl ?? imageEntity?.localPreviewUrl ?? null
    };

    // 使用提取的属性进行比较，避免对象引用问题
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

  const { containerStyle, imageStyle, placeholderStyle, statusStyle, statusLabel } = useMemo(() => {
    // 使用已提取的属性（带默认值）
    const effectiveSizePreset = attrSizePreset || DEFAULT_IMAGE_PRESET;
    const effectiveAlignment = attrAlignment || DEFAULT_IMAGE_ALIGNMENT;

    if (!imageNode) {
      // 如果有 steamPoolImage，说明是从 Steam 导入的图片，应该正常显示
      if (steamPoolImage) {
        const { containerStyle, imageStyle } = computeDisplayStyles(effectiveSizePreset, effectiveAlignment);
        return {
          containerStyle,
          imageStyle,
          placeholderStyle: placeholderImageStyle(),
          statusStyle: undefined,
          statusLabel: undefined
        };
      }

      // 如果有 imageEntity（从新 Store），根据状态显示
      if (imageEntity) {
        // 使用已提取的属性（用户通过右键菜单修改的值优先）
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

        // BBCode 导入但没有 steamUrls：说明图片不在 Steam 图片池中
        // 也没有本地预览，视为引用失效
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

        // 正常状态（有 URL）：应用正确的尺寸和对齐
        return {
          containerStyle,
          imageStyle,
          placeholderStyle: placeholderImageStyle(),
          statusStyle: undefined,
          statusLabel: undefined
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
    }

    // 使用 node.attrs 的值覆盖 imageNode.display（用户通过右键菜单修改的优先）
    const effectiveImageNode = {
      ...imageNode,
      display: {
        ...imageNode.display,
        preset: effectiveSizePreset as ImageSizePreset,
        alignment: effectiveAlignment as ImageAlignment
      }
    };
    const dims = resolveRenderDimensions(effectiveImageNode);
    const container = baseContainerStyle(effectiveAlignment, dims.containerWidthPx, dims.mode);
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
  }, [imageNode, imageEntity, steamPoolImage, attrPreviewId, attrAlignment, attrSizePreset]);

  // 跟踪 CDN URL 是否加载失败，用于 fallback 到本地预览
  const [cdnUrlLoadFailed, setCdnUrlLoadFailed] = useState(false);

  // 当 imageNode 变化时重置 fallback 状态
  useEffect(() => {
    setCdnUrlLoadFailed(false);
  }, [imageNode?.cdnUrl]);

  const src = useMemo(() => {
    const attrPreview = attrPreviewDataUrl ?? undefined;

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
  }, [imageEntity, imageNode, steamPoolImage, attrPreviewDataUrl, cdnUrlLoadFailed]);

  // 处理图片加载成功
  const handleImageLoad = useCallback(() => {
    // 如果图片从 BBCode 导入，加载成功说明引用有效，标记为 synced
    if (imageEntity && imageEntity.status === "uploaded" && imageEntity.source === "bbcode") {
      loggers.image.info('BBCode 导入图片加载成功，标记为 synced', {
        imageId: imageEntity.id,
        steamPreviewId: imageEntity.steamPreviewId
      });
      useImageStore.getState().markSynced(imageEntity.id);
    }
  }, [imageEntity]);

  // 处理图片加载失败
  const handleImageLoadError = useCallback(() => {
    // 优先处理 CDN URL 回退
    if (imageNode?.cdnUrl && !cdnUrlLoadFailed) {
      loggers.image.warn('CDN URL 加载失败，尝试回退到本地预览:', imageNode.cdnUrl);
      setCdnUrlLoadFailed(true);
      return;
    }

    // 如果图片从 BBCode 导入且没有本地预览，加载失败说明引用失效
    if (imageEntity && imageEntity.status === "uploaded" && imageEntity.source === "bbcode") {
      // 检查是否还有本地预览可用
      const hasLocalPreview = imageEntity.localPreviewUrl || attrPreviewDataUrl;
      if (!hasLocalPreview) {
        loggers.image.warn('BBCode 导入图片加载失败，标记为 orphaned', {
          imageId: imageEntity.id,
          steamPreviewId: imageEntity.steamPreviewId
        });
        useImageStore.getState().markOrphaned(imageEntity.id);
      }
    }
  }, [imageNode?.cdnUrl, cdnUrlLoadFailed, imageEntity, attrPreviewDataUrl]);

  const alt = imageEntity?.fileName ?? imageEntity?.originalName ?? imageNode?.fileName ?? imageNode?.originalName ?? steamPoolImage?.fileName ?? attrFileName ?? "NASGE 图片";

  // 获取图片状态（用于状态指示器）
  const imageState = useMemo(() => {
    // === 优先使用新 Store 的 imageEntity ===
    if (imageEntity) {
      // BBCode 导入但没有可用 URL，视为错误
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
      className="nasge-image-node-wrapper"
      data-preview-id={attrPreviewId ?? imageNode?.previewId}
      data-upload-id={imageNode?.uploadId}
      data-image-node-id={imageNode?.nodeId ?? imageNodeId ?? attrPreviewId ?? undefined}
      data-size-preset={attrSizePreset || "original"}
      data-alignment={attrAlignment || "inline"}
    >
      {/* 内部 div 用于应用样式，React 可以正确更新 */}
      <div className="nasge-image-node" style={containerStyle}>
        {src ? (
          <>
            <img
              src={src}
              alt={alt}
              style={{
                ...imageStyle,
                // 未上传状态：降低亮度
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

      </div>
    </NodeViewWrapper>
  );
};

type WidthMode = "natural" | "fixed" | "full" | "inline-auto";

/**
 * 统一的显示样式计算函数
 * 根据 sizePreset 和 alignment 计算正确的容器和图片样式
 * 用于 steamPoolImage 和 imageEntity 路径
 */
function computeDisplayStyles(
  sizePreset: string,
  alignment: string
): { containerStyle: React.CSSProperties; imageStyle: React.CSSProperties } {
  const isFloat = alignment === "floatLeft" || alignment === "floatRight";
  const isThumb = sizePreset === "thumb" || sizePreset === "half";
  const isFull = sizePreset === "full";

  // 容器样式 — margin 对齐 Steam 官方 (tests/new/steam-official-image-styles.md)
  const containerStyle: React.CSSProperties = {
    position: "relative",
    overflow: "hidden",
    padding: 0,
    verticalAlign: "baseline",
  };

  // Steam float margin: floatLeft="4px 6px 4px 0px", floatRight="4px 0px 4px 6px"
  // Steam inline margin: "0px"
  if (isFull) {
    // sizeFull: 占满宽度，Steam 仍带 floatLeft
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
    // sizeOriginal
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

  // 图片样式
  const imageStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    height: "auto",
    maxWidth: "100%",
    userSelect: "none",
    // pointerEvents: "none" 已移除 - 允许图片响应点击和右键事件
    objectFit: "fill",
    margin: 0,
  };

  return { containerStyle, imageStyle };
}

function baseContainerStyle(
  alignment: string,
  widthPx?: number,
  widthMode: WidthMode = "fixed"
): React.CSSProperties {
  // margin 对齐 Steam 官方
  const base: React.CSSProperties = {
    display: widthMode === "full" ? "block" : "inline-block",
    margin: widthMode === "full"
      ? "4px 6px 4px 0px"
      : "0",
    padding: 0,
    overflow: "hidden",
    position: "relative",
    verticalAlign: "baseline",
    maxWidth: "100%"
  };

  if (widthMode === "full") {
    base.width = "100%";
  } else if (typeof widthPx === "number" && widthPx > 0) {
    base.width = `${widthPx}px`;
    base.maxWidth = "100%";
  }

  if (alignment === "floatLeft") {
    return {
      ...base,
      display: "block",
      float: "left",
      margin: "4px 6px 4px 0px"
    };
  }

  if (alignment === "floatRight") {
    return {
      ...base,
      display: "block",
      float: "right",
      margin: "4px 0px 4px 6px"
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
    // pointerEvents: "none" 已移除 - 允许图片响应点击和右键事件
    // Steam 官方使用 object-fit: fill
    objectFit: "fill",
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
      // half 等同于 Steam sizeThumb: max-width 311px，小图不放大
      const widthPx = Math.min(intrinsicWidth, STEAM_THUMB_WIDTH);
      const heightPx = Math.max(1, Math.round((intrinsicHeight / intrinsicWidth) * widthPx));
      return {
        mode: "fixed",
        imageWidthPx: widthPx,
        containerWidthPx: widthPx,
        estimatedHeightPx: heightPx
      };
    }
    case "thumb": {
      // Steam sizeThumb: max-width 311px，小图不放大
      const widthPx = Math.min(intrinsicWidth, STEAM_THUMB_WIDTH);
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
