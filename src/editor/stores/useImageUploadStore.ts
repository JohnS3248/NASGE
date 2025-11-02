import { create } from "zustand";
import type { UploadResult, UploadScope } from "../../shared/messages";

export type ImageUploadStatus = "idle" | "uploading" | "uploaded" | "failed";

export type ImageUploadSource = "paste" | "drop" | "file-input" | "clipboard-url";

export type ImageUploadMetadata = {
  source?: ImageUploadSource;
  cursorPosition?: number;
  note?: string;
  retryMessage?: string;
};

export type ImageUploadRecord = {
  id: string;
  scope: UploadScope;
  originalName: string;
  generatedName: string;
  file: File;
  status: ImageUploadStatus;
  previewIds: string[];
  error?: string;
  createdAt: number;
  updatedAt: number;
  metadata?: ImageUploadMetadata;
};

type ImageUploadState = {
  items: Record<string, ImageUploadRecord>;
  order: string[];
  counters: Record<UploadScope, number>;
  prepare: (file: File, scope: UploadScope, metadata?: ImageUploadMetadata) => ImageUploadRecord;
  markUploading: (id: string) => void;
  markUploaded: (id: string, result: UploadResult) => void;
  markFailed: (id: string, error: string) => void;
  remove: (id: string) => void;
  reset: (scope?: UploadScope) => void;
  setMetadata: (id: string, patch: Partial<ImageUploadMetadata>) => void;
};

export const useImageUploadStore = create<ImageUploadState>((set, get) => ({
  items: {},
  order: [],
  counters: {
    "chapter-preview": 0,
    "guide-cover": 0
  },
  prepare: (file, scope, metadata) => {
    const state = get();
    const generatedName = buildGeneratedName(file.name, state);
    const id = createId();
    const now = Date.now();

    const record: ImageUploadRecord = {
      id,
      scope,
      originalName: file.name,
      generatedName,
      file,
      status: "idle",
      previewIds: [],
      createdAt: now,
      updatedAt: now,
      metadata
    };

    set((state) => ({
      counters: state.counters,
      items: {
        ...state.items,
        [id]: record
      },
      order: [...state.order, id]
    }));

    return record;
  },
  markUploading: (id) => {
    set((state) => updateRecord(state, id, { status: "uploading" }));
  },
  markUploaded: (id, result) => {
    set((state) =>
      updateRecord(state, id, {
        status: "uploaded",
        previewIds: result.previewIds,
        updatedAt: Date.now()
      })
    );
  },
  markFailed: (id, error) => {
    set((state) =>
      updateRecord(state, id, {
        status: "failed",
        error,
        updatedAt: Date.now()
      })
    );
  },
  setMetadata: (id, patch) => {
    set((state) => {
      const existing = state.items[id];
      if (!existing) {
        return state;
      }
      return updateRecord(state, id, {
        metadata: {
          ...(existing.metadata ?? {}),
          ...patch
        }
      });
    });
  },
  remove: (id) => {
    set((state) => {
      if (!state.items[id]) {
        return state;
      }

      const { [id]: _, ...rest } = state.items;
      return {
        ...state,
        items: rest,
        order: state.order.filter((itemId) => itemId !== id)
      };
    });
  },
  reset: (scope) => {
    set((state) => {
      if (!scope) {
        return {
          items: {},
          order: [],
          counters: {
            "chapter-preview": 0,
            "guide-cover": 0
          }
        };
      }

      const filteredEntries = Object.entries(state.items).filter(
        ([, record]) => record.scope !== scope
      );

      const items = Object.fromEntries(filteredEntries);
      const order = state.order.filter((id) => items[id]);

      return {
        items,
        order,
        counters: {
          ...state.counters,
          [scope]: 0
        }
      };
    });
  }
}));

function buildGeneratedName(originalName: string, state: ImageUploadState): string {
  const sanitized = sanitizeFileName(originalName);
  if (!state.order.some((id) => state.items[id]?.generatedName === sanitized)) {
    return sanitized;
  }

  const ext = extractExtension(originalName);
  const base = sanitized.replace(new RegExp(`\\.${ext}$`, "i"), "");

  let index = 1;
  let candidate = `${base}_${index}.${ext}`;
  while (state.order.some((id) => state.items[id]?.generatedName === candidate)) {
    index += 1;
    candidate = `${base}_${index}.${ext}`;
  }

  return candidate;
}

function sanitizeFileName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return `image_${Date.now()}.png`;
  }

  const ext = extractExtension(trimmed);
  const base = trimmed.replace(new RegExp(`\\.${ext}$`, "i"), "");
  const safeBase = base.replace(/[\s\\/:*?"<>|]/g, "_");
  return `${safeBase}.${ext}`;
}

function extractExtension(name: string): string {
  const match = /\.([a-zA-Z0-9]+)$/.exec(name ?? "");
  if (!match) {
    return "png";
  }
  return match[1].toLowerCase();
}

function updateRecord(
  state: ImageUploadState,
  id: string,
  patch: Partial<ImageUploadRecord>
) {
  if (!state.items[id]) {
    return state;
  }

  return {
    ...state,
    items: {
      ...state.items,
      [id]: {
        ...state.items[id],
        ...patch,
        updatedAt: Date.now()
      }
    }
  };
}

function createId(): string {
  if (typeof crypto?.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `img_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
