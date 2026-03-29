import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { loggers } from "../../shared/logger";
import type { SteamGuideImage } from "../../shared/messages";

// 触发旧 store 迁移（必须先于 store 创建）
import "./migrateLegacyStore";

// ============================================================================
// 类型定义
// ============================================================================

export type ChapterInfo = {
  sectionId: string;
  title: string;
  order: number;
};

export type ImageTag = {
  id: string;
  name: string;
  color: string;
  order: number;
};

export const TAG_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280',
] as const;

export type GuideArchive = {
  guideId: string;
  guideName: string;
  coverUrl?: string;

  chapters: ChapterInfo[];
  chaptersUpdatedAt: number;

  // 图片分组（已废弃，保留兼容已持久化数据）
  imageGroups?: unknown[];

  // 图片标签系统
  imageTags: ImageTag[];
  imageTagMap: Record<string, string[]>;

  // 缓存的 Steam 图片元数据
  cachedImages?: SteamGuideImage[];
  imagesUpdatedAt?: number;

  // 元数据
  createdAt: number;
  lastAccessedAt: number;
};

// ============================================================================
// Store
// ============================================================================

type ArchiveState = {
  archives: Record<string, GuideArchive>;

  // 存档 CRUD
  createArchive: (guideId: string, info: { title: string; coverUrl?: string; chapters: ChapterInfo[] }) => GuideArchive;
  updateArchive: (guideId: string, patch: Partial<GuideArchive>) => void;
  deleteArchive: (guideId: string) => void;
  getArchive: (guideId: string) => GuideArchive | undefined;
  saveChaptersToArchive: (guideId: string, chapters: ChapterInfo[]) => void;

  // 标签 CRUD
  createTag: (guideId: string, name: string, color?: string) => ImageTag | null;
  updateTag: (guideId: string, tagId: string, patch: Partial<Omit<ImageTag, 'id'>>) => void;
  deleteTag: (guideId: string, tagId: string) => void;
  reorderTags: (guideId: string, tagIds: string[]) => void;

  // 图片打标签
  addTagToImage: (guideId: string, imageId: string, tagId: string) => void;
  removeTagFromImage: (guideId: string, imageId: string, tagId: string) => void;
  setImageTags: (guideId: string, imageId: string, tagIds: string[]) => void;

  // 标签查询
  getTagsForImage: (guideId: string, imageId: string) => ImageTag[];
  getImageIdsByTag: (guideId: string, tagId: string) => string[];
  getUntaggedImageIds: (guideId: string) => string[];
};

export const useArchiveStore = create<ArchiveState>()(
  persist(
    (set, get) => ({
      archives: {},

      // === 存档 CRUD ===

      createArchive: (guideId, info) => {
        const newArchive: GuideArchive = {
          guideId,
          guideName: info.title,
          coverUrl: info.coverUrl,
          chapters: info.chapters,
          chaptersUpdatedAt: Date.now(),
          imageTags: [],
          imageTagMap: {},
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
        };
        set((s) => ({
          archives: { ...s.archives, [guideId]: newArchive },
        }));
        loggers.store.info('创建存档', { guideId, guideName: info.title });
        return newArchive;
      },

      updateArchive: (guideId, patch) => {
        set((s) => {
          const archive = s.archives[guideId];
          if (!archive) return s;
          return {
            archives: { ...s.archives, [guideId]: { ...archive, ...patch } },
          };
        });
      },

      deleteArchive: (guideId) => {
        set((s) => {
          const { [guideId]: _, ...remaining } = s.archives;
          return { archives: remaining };
        });
        loggers.store.info('删除存档', { guideId });
      },

      getArchive: (guideId) => get().archives[guideId],

      saveChaptersToArchive: (guideId, chapters) => {
        set((s) => {
          const archive = s.archives[guideId];
          if (!archive) return s;
          return {
            archives: {
              ...s.archives,
              [guideId]: { ...archive, chapters, chaptersUpdatedAt: Date.now() },
            },
          };
        });
      },

      // === 标签 CRUD ===

      createTag: (guideId, name, color) => {
        const archive = get().archives[guideId];
        if (!archive) return null;

        const usedColors = archive.imageTags.map(t => t.color);
        const availableColor = TAG_COLORS.find(c => !usedColors.includes(c))
          || TAG_COLORS[archive.imageTags.length % TAG_COLORS.length];

        const newTag: ImageTag = {
          id: crypto.randomUUID(),
          name,
          color: color || availableColor,
          order: archive.imageTags.length,
        };

        set((s) => ({
          archives: {
            ...s.archives,
            [guideId]: { ...archive, imageTags: [...archive.imageTags, newTag] },
          },
        }));
        loggers.store.info('创建标签', { guideId, tagName: name, tagId: newTag.id });
        return newTag;
      },

      updateTag: (guideId, tagId, patch) => {
        set((s) => {
          const archive = s.archives[guideId];
          if (!archive) return s;
          return {
            archives: {
              ...s.archives,
              [guideId]: {
                ...archive,
                imageTags: archive.imageTags.map(t => t.id === tagId ? { ...t, ...patch } : t),
              },
            },
          };
        });
      },

      deleteTag: (guideId, tagId) => {
        set((s) => {
          const archive = s.archives[guideId];
          if (!archive) return s;

          const newTagMap: Record<string, string[]> = {};
          for (const [imageId, tagIds] of Object.entries(archive.imageTagMap)) {
            const filtered = tagIds.filter(id => id !== tagId);
            if (filtered.length > 0) newTagMap[imageId] = filtered;
          }

          return {
            archives: {
              ...s.archives,
              [guideId]: {
                ...archive,
                imageTags: archive.imageTags.filter(t => t.id !== tagId),
                imageTagMap: newTagMap,
              },
            },
          };
        });
        loggers.store.info('删除标签', { guideId, tagId });
      },

      reorderTags: (guideId, tagIds) => {
        set((s) => {
          const archive = s.archives[guideId];
          if (!archive) return s;

          const reordered = tagIds
            .map((id, index) => {
              const tag = archive.imageTags.find(t => t.id === id);
              return tag ? { ...tag, order: index } : null;
            })
            .filter((t): t is ImageTag => t !== null);

          return {
            archives: {
              ...s.archives,
              [guideId]: { ...archive, imageTags: reordered },
            },
          };
        });
      },

      // === 图片打标签 ===

      addTagToImage: (guideId, imageId, tagId) => {
        set((s) => {
          const archive = s.archives[guideId];
          if (!archive) return s;
          if (!archive.imageTags.some(t => t.id === tagId)) return s;

          const currentTags = archive.imageTagMap[imageId] || [];
          if (currentTags.includes(tagId)) return s;

          return {
            archives: {
              ...s.archives,
              [guideId]: {
                ...archive,
                imageTagMap: { ...archive.imageTagMap, [imageId]: [...currentTags, tagId] },
              },
            },
          };
        });
      },

      removeTagFromImage: (guideId, imageId, tagId) => {
        set((s) => {
          const archive = s.archives[guideId];
          if (!archive) return s;

          const currentTags = archive.imageTagMap[imageId] || [];
          const newTags = currentTags.filter(id => id !== tagId);
          const newTagMap = { ...archive.imageTagMap };
          if (newTags.length > 0) newTagMap[imageId] = newTags;
          else delete newTagMap[imageId];

          return {
            archives: {
              ...s.archives,
              [guideId]: { ...archive, imageTagMap: newTagMap },
            },
          };
        });
      },

      setImageTags: (guideId, imageId, tagIds) => {
        set((s) => {
          const archive = s.archives[guideId];
          if (!archive) return s;

          const validTagIds = tagIds.filter(id => archive.imageTags.some(t => t.id === id));
          const newTagMap = { ...archive.imageTagMap };
          if (validTagIds.length > 0) newTagMap[imageId] = validTagIds;
          else delete newTagMap[imageId];

          return {
            archives: {
              ...s.archives,
              [guideId]: { ...archive, imageTagMap: newTagMap },
            },
          };
        });
      },

      // === 标签查询 ===

      getTagsForImage: (guideId, imageId) => {
        const archive = get().archives[guideId];
        if (!archive) return [];
        const tagIds = archive.imageTagMap[imageId] || [];
        return tagIds
          .map(id => archive.imageTags.find(t => t.id === id))
          .filter((t): t is ImageTag => t !== undefined)
          .sort((a, b) => a.order - b.order);
      },

      getImageIdsByTag: (guideId, tagId) => {
        const archive = get().archives[guideId];
        if (!archive) return [];
        return Object.entries(archive.imageTagMap)
          .filter(([_, tagIds]) => tagIds.includes(tagId))
          .map(([imageId]) => imageId);
      },

      getUntaggedImageIds: (guideId) => {
        const archive = get().archives[guideId];
        if (!archive) return [];
        const allImageIds = (archive.cachedImages || []).map(img => img.previewId);
        return allImageIds.filter(id => {
          const tags = archive.imageTagMap[id];
          return !tags || tags.length === 0;
        });
      },
    }),
    {
      name: "nasge-archives",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ archives: state.archives }),

      merge: (persisted: unknown, current: ArchiveState) => {
        const p = persisted as Partial<ArchiveState> | null;
        return {
          ...current,
          archives: p?.archives ?? current.archives,
        };
      },

      migrate: (persisted: unknown, _version: number) => {
        const state = persisted as { archives?: Record<string, GuideArchive> } | null;
        if (!state) return { archives: {} };

        // 确保每个存档都有 imageTags / imageTagMap
        if (state.archives) {
          for (const archive of Object.values(state.archives)) {
            if (!archive.imageTags) archive.imageTags = [];
            if (!archive.imageTagMap) archive.imageTagMap = {};
          }
        }
        return state;
      },

      onRehydrateStorage: () => (_state, error) => {
        if (error) loggers.persist.error('useArchiveStore rehydration 失败', error);
      },
    }
  )
);
