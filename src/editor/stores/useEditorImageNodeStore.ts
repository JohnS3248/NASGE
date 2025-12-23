import { create } from "zustand";
import type { UploadResult } from "../../shared/messages";
import type {
  ImageUploadMetadata,
  ImageUploadRecord
} from "./useImageUploadStore";

export type ImageNodeStatus =
  | "intake"
  | "uploading"
  | "ready"
  | "error"
  | "detached";

export type ImageDisplayPreset = "original" | "full" | "half" | "thumb";
export type ImageAlignment = "floatLeft" | "floatRight" | "inline";

export const DEFAULT_IMAGE_PRESET: ImageDisplayPreset = "original";
export const DEFAULT_IMAGE_ALIGNMENT: ImageAlignment = "inline";

export type EditorImageNode = {
  nodeId: string;
  uploadId?: string;
  previewId?: string;
  redirectUrl?: string;
  cdnUrl?: string;
  status: ImageNodeStatus;
  originalName: string;
  fileName?: string;
  fileSize: number;
  originalSize?: {
    width: number;
    height: number;
  };
  display: {
    preset: ImageDisplayPreset;
    alignment: ImageAlignment;
    customWidthPx?: number;
  };
  metadata: {
    source?: ImageUploadMetadata["source"];
    cursorPosition?: number;
    insertedAt: number;
    previewDataUrl?: string;
  };
  error?: string;
};

type RegisterNodeOptions = {
  file: File;
  metadata: {
    source?: ImageUploadMetadata["source"];
    cursorPosition?: number;
  };
  previewDataUrl?: string;
  intrinsicSize?: {
    width: number;
    height: number;
  };
};

type MarkUploadedPayload = {
  record: ImageUploadRecord;
  result: UploadResult;
};

type EditorImageNodePatch = Partial<
  Omit<EditorImageNode, "metadata" | "display">
> & {
  metadata?: Partial<EditorImageNode["metadata"]>;
  display?: Partial<EditorImageNode["display"]>;
};

type RegisterFromSteamPoolOptions = {
  previewId: string;
  fileName: string;
  uploadId: string | null;
  originalUrl: string;
  thumbnailUrl: string;
};

type EditorImageNodeState = {
  nodes: Record<string, EditorImageNode>;
  registerFromLocalFile: (options: RegisterNodeOptions) => EditorImageNode;
  registerFromSteamPool: (options: RegisterFromSteamPoolOptions) => EditorImageNode;
  attachUploadRecord: (nodeId: string, record: ImageUploadRecord) => void;
  markUploading: (nodeId: string) => void;
  markUploaded: (nodeId: string, payload: MarkUploadedPayload) => void;
  markFailed: (nodeId: string, error: string) => void;
  removeNode: (nodeId: string) => void;
  updateDisplay: (
    nodeId: string,
    patch: Partial<EditorImageNode["display"]>
  ) => void;
};

export const useEditorImageNodeStore = create<EditorImageNodeState>(
  (set, get) => ({
    nodes: {},
    registerFromLocalFile: ({ file, metadata, previewDataUrl, intrinsicSize }) => {
      const nodeId = createNodeId();
      const now = Date.now();
      const node: EditorImageNode = {
        nodeId,
        status: "intake",
        originalName: file.name,
        fileSize: file.size,
        originalSize: intrinsicSize,
        display: {
          preset: DEFAULT_IMAGE_PRESET,
          alignment: DEFAULT_IMAGE_ALIGNMENT
        },
        metadata: {
          source: metadata.source,
          cursorPosition: metadata.cursorPosition,
          insertedAt: now,
          previewDataUrl
        }
      };

      set((state) => ({
        nodes: {
          ...state.nodes,
          [nodeId]: node
        }
      }));

      return node;
    },
    registerFromSteamPool: ({ previewId, fileName, uploadId, originalUrl, thumbnailUrl }) => {
      const nodeId = createNodeId();
      const now = Date.now();
      const node: EditorImageNode = {
        nodeId,
        status: "ready",
        previewId,
        uploadId: uploadId || undefined,
        fileName,
        originalName: fileName,
        fileSize: 0, // 未知
        cdnUrl: originalUrl, // 使用 originalUrl 作为 cdnUrl
        display: {
          preset: DEFAULT_IMAGE_PRESET,
          alignment: DEFAULT_IMAGE_ALIGNMENT
        },
        metadata: {
          source: "paste", // 使用一个合法的 source 值
          insertedAt: now
        }
      };

      set((state) => ({
        nodes: {
          ...state.nodes,
          [nodeId]: node
        }
      }));

      return node;
    },
    attachUploadRecord: (nodeId, record) => {
      set((state) =>
        updateNode(state, nodeId, {
          uploadId: record.id,
          fileName: record.generatedName ?? record.originalName
        })
      );
    },
    markUploading: (nodeId) => {
      set((state) => updateNode(state, nodeId, { status: "uploading" }));
    },
    markUploaded: (nodeId, payload) => {
      const { record, result } = payload;
      const steamPreviewId = result.previewIds[0];
      // 注意：buildPreviewImageUrl 生成的 economy CDN URL 可能返回 404
      // 保留 previewDataUrl 作为 fallback，确保图片始终可显示
      const economyCdnUrl = steamPreviewId ? buildPreviewImageUrl(steamPreviewId) : undefined;

      // 不清除 previewDataUrl，保留本地预览作为 fallback
      // 当 economy CDN URL 不可用时，图片组件可以回退到本地预览
      set((state) =>
        updateNode(state, nodeId, {
          status: "ready",
          previewId: steamPreviewId,
          redirectUrl: result.redirectUrl,
          cdnUrl: economyCdnUrl,
          uploadId: record.id,
          fileName: record.generatedName ?? record.originalName
          // 不再清除 metadata.previewDataUrl
        })
      );
    },
    markFailed: (nodeId, error) => {
      set((state) =>
        updateNode(state, nodeId, {
          status: "error",
          error
        })
      );
    },
    removeNode: (nodeId) => {
      const existing = get().nodes[nodeId];
      set((state) => {
        if (!state.nodes[nodeId]) {
          return state;
        }
        const { [nodeId]: _removed, ...rest } = state.nodes;
        return {
          ...state,
          nodes: rest
        };
      });
    },
    updateDisplay: (nodeId, patch) => {
      set((state) =>
        updateNode(state, nodeId, {
          display: patch
        })
      );
    }
  })
);

function updateNode(
  state: EditorImageNodeState,
  nodeId: string,
  patch: EditorImageNodePatch
) {
  const node = state.nodes[nodeId];
  if (!node) {
    return state;
  }

  const { metadata: metadataPatch, display: displayPatch, ...rest } = patch;
  const nextMetadata =
    metadataPatch === undefined
      ? node.metadata
      : {
          ...node.metadata,
          ...metadataPatch
        };
  const nextDisplay =
    displayPatch === undefined
      ? node.display
      : {
          ...node.display,
          ...displayPatch
        };

  return {
    ...state,
    nodes: {
      ...state.nodes,
      [nodeId]: {
        ...node,
        ...rest,
        metadata: nextMetadata,
        display: nextDisplay
      }
    }
  };
}

function createNodeId(): string {
  if (typeof crypto?.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `img_node_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function buildPreviewImageUrl(previewId: string): string {
  return `https://steamcommunity-a.akamaihd.net/economy/image/UGC/${previewId}`;
}
