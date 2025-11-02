import React, { useEffect, useMemo } from "react";
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
          default: null
        },
        uploadId: {
          default: null
        },
        previewId: {
          default: null
        },
        sizePreset: {
          default: DEFAULT_IMAGE_PRESET
        },
        alignment: {
          default: DEFAULT_IMAGE_ALIGNMENT
        },
        fileName: {
          default: null
        },
        previewDataUrl: {
          default: null
        }
      };
    },
    parseHTML() {
      return [
        {
          tag: "figure[data-nasge-image]"
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
  const imageNode = useEditorImageNodeStore(
    (state) => (imageNodeId ? state.nodes[imageNodeId] : undefined)
  );
  const removeNode = useEditorImageNodeStore((state) => state.removeNode);

  useEffect(() => {
    if (!imageNodeId || imageNode) {
      return;
    }

    if (!node.attrs.previewDataUrl) {
      console.warn("[NASGE] steamImage 节点缺少关联数据", {
        imageNodeId,
        nodes: useEditorImageNodeStore.getState().nodes
      });
    }
  }, [imageNode, imageNodeId, node.attrs.previewDataUrl]);

  useEffect(() => {
    return () => {
      if (imageNodeId) {
        removeNode(imageNodeId);
      }
    };
  }, [imageNodeId, removeNode]);

  useEffect(() => {
    if (!imageNode) {
      return;
    }
    const nextAttrs = {
      imageNodeId: imageNode.nodeId,
      uploadId: imageNode.uploadId ?? null,
      previewId: imageNode.previewId ?? null,
      sizePreset: imageNode.display.preset,
      alignment: imageNode.display.alignment,
      fileName: imageNode.fileName ?? imageNode.originalName,
      previewDataUrl: imageNode.metadata.previewDataUrl ?? null
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
  }, [imageNode, node.attrs, updateAttributes]);

  const { containerStyle, imageStyle, placeholderStyle, statusStyle, statusLabel } = useMemo(() => {
    if (!imageNode) {
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
  }, [imageNode]);

  const src = useMemo(() => {
    const attrPreview = (node.attrs.previewDataUrl as string | null) ?? undefined;
    if (!imageNode) {
      return attrPreview;
    }

    return (
      imageNode.cdnUrl ??
      imageNode.redirectUrl ??
      imageNode.metadata.previewDataUrl ??
      attrPreview
    );
  }, [imageNode, node.attrs.previewDataUrl]);

  const alt = imageNode?.fileName ?? imageNode?.originalName ?? "NASGE 图片";

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
        <img
          src={src}
          alt={alt}
          style={imageStyle}
          draggable={false}
        />
      ) : (
        <div style={placeholderStyle} />
      )}
      {statusStyle && statusLabel ? (
        <div style={statusStyle}>{statusLabel}</div>
      ) : null}
    </NodeViewWrapper>
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
    position: "relative"
  };

  if (widthMode === "full") {
    base.width = "100%";
  } else if (typeof widthPx === "number" && widthPx > 0) {
    base.width = `${widthPx}px`;
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
  if (dimensions.mode === "full") {
    return {
      display: "block",
      width: "100%",
      height: "auto",
      maxWidth: "100%",
      userSelect: "none",
      pointerEvents: "none"
    };
  }

  if (dimensions.mode === "fixed" && typeof dimensions.imageWidthPx === "number") {
    return {
      display: "block",
      width: `${dimensions.imageWidthPx}px`,
      height: "auto",
      maxWidth: "100%",
      userSelect: "none",
      pointerEvents: "none"
    };
  }

  return {
    display: "block",
    width: "auto",
    height: "auto",
    maxWidth: "100%",
    userSelect: "none",
    pointerEvents: "none"
  };
}

function placeholderImageStyle(widthPx?: number, heightPx?: number): React.CSSProperties {
  return {
    width: widthPx ? `${widthPx}px` : "320px",
    height: heightPx ? `${heightPx}px` : "200px",
    background: "rgba(14, 26, 40, 0.6)",
    border: "1px dashed rgba(102, 192, 244, 0.32)"
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
    default:
      return {
        mode: "fixed",
        imageWidthPx: intrinsicWidth,
        containerWidthPx: intrinsicWidth,
        estimatedHeightPx: intrinsicHeight
      };
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
