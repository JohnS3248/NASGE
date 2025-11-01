import { create } from "zustand";
import type { UploadResult, UploadScope } from "../../shared/messages";

export type ImageUploadStatus = "idle" | "uploading" | "uploaded" | "failed";

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
};

type ImageUploadState = {
  items: Record<string, ImageUploadRecord>;
  order: string[];
  counters: Record<UploadScope, number>;
  prepare: (file: File, scope: UploadScope) => ImageUploadRecord;
  markUploading: (id: string) => void;
  markUploaded: (id: string, result: UploadResult) => void;
  markFailed: (id: string, error: string) => void;
  remove: (id: string) => void;
  reset: (scope?: UploadScope) => void;
};

export const useImageUploadStore = create<ImageUploadState>((set, get) => ({
  items: {},
  order: [],
  counters: {
    "chapter-preview": 0,
    "guide-cover": 0
  },
  prepare: (file, scope) => {
    const state = get();
    const nextNumber = (state.counters[scope] ?? 0) + 1;
    const generatedName = `${nextNumber}.${extractExtension(file.name)}`;
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
      updatedAt: now
    };

    set((state) => ({
      counters: {
        ...state.counters,
        [scope]: nextNumber
      },
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

function extractExtension(name: string): string {
  const match = /\.([a-zA-Z0-9]+)$/.exec(name);
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
