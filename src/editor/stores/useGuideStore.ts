"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { JSONContent } from "@tiptap/core";
import { createEmptyDoc } from "../utils/editorExtensions";
import { createTitleFromText, createEmptyTitle } from "../utils/titleHelpers";
import { loggers } from "../../shared/logger";
import type { SteamGuideImage } from "../../shared/messages";

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 编辑器模式
 * - guide: 指南模式（完整功能：章节、图片池等）
 * - review: 评测模式（简化版：仅文字编辑）
 * - offline: 离线模式（草稿模式：无 Steam 连接）
 */
export type EditorMode = 'guide' | 'review' | 'offline';

/**
 * 章节信息（从 Steam 导入，可离线缓存）
 */
export type ChapterInfo = {
  sectionId: string;
  title: string;
  order: number;
};

/**
 * 指南基本信息（从 Steam 导入）
 */
export type GuideInfo = {
  id: string;
  title: string;
  coverUrl?: string;
  chapters: ChapterInfo[];
};

/**
 * 图片分组（本地功能，Steam 无此功能）
 * @deprecated 使用新的标签系统 ImageTag 替代
 */
export type ImageGroup = {
  id: string;
  name: string;
  color?: string;
  imageIds: string[];  // previewId 或 fileName
  order: number;
};

/**
 * 图片标签（一个图片可以有多个标签）
 */
export type ImageTag = {
  id: string;
  name: string;
  color: string;  // 标签颜色（必填，用于 UI 识别）
  order: number;  // 排序顺序
};

/**
 * 预设标签颜色
 */
export const TAG_COLORS = [
  '#ef4444', // 红色
  '#f97316', // 橙色
  '#eab308', // 黄色
  '#22c55e', // 绿色
  '#06b6d4', // 青色
  '#3b82f6', // 蓝色
  '#8b5cf6', // 紫色
  '#ec4899', // 粉色
  '#6b7280', // 灰色
] as const;

/**
 * 指南存档（每个指南一个）
 */
export type GuideArchive = {
  guideId: string;
  guideName: string;
  coverUrl?: string;

  // 离线章节缓存
  chapters: ChapterInfo[];
  chaptersUpdatedAt: number;

  // 图片分组（已废弃，保留兼容）
  imageGroups: ImageGroup[];

  // 图片标签系统（新）
  imageTags: ImageTag[];                    // 存档的标签定义
  imageTagMap: Record<string, string[]>;    // imageId -> tagIds 映射

  // 缓存的 Steam 图片元数据
  cachedImages?: SteamGuideImage[];
  imagesUpdatedAt?: number;

  // 关联的草稿 ID 列表（便于查询）
  draftIds: string[];

  // 元数据
  createdAt: number;
  lastAccessedAt: number;
};

/**
 * 草稿（本地编辑的内容）
 */
export type Draft = {
  id: string;
  draftName: string;
  title: JSONContent;
  content: JSONContent;
  updatedAt: number;
  linkedChapterId?: string;
  linkedGuideId?: string;
  lastSyncedAt?: number;
};

// ============================================================================
// Store 状态类型
// ============================================================================

type GuideState = {
  // === 当前会话 ===
  mode: EditorMode;
  currentArchiveId: string | null;

  // === 指南信息（运行时，从存档或 Steam 加载）===
  guideInfo: GuideInfo | null;

  // === 草稿 ===
  drafts: Draft[];
  activeDraftId: string | null;
  currentChapterId: string | null;
  isDirty: boolean;
  isBindingMode: boolean;

  // === 存档系统 ===
  archives: Record<string, GuideArchive>;

  // === 模式管理 ===
  setMode: (mode: EditorMode) => void;

  // === 指南信息管理 ===
  setGuideInfo: (info: GuideInfo) => void;
  clearGuideInfo: () => void;

  // === 草稿管理 ===
  selectDraft: (id: string) => void;
  addDraft: (title?: string) => Draft;
  updateDraft: (id: string, patch: Partial<Draft>) => void;
  deleteDraft: (id: string) => void;
  duplicateDraft: (id: string) => Draft | null;
  restoreDraft: () => void;
  reorderDrafts: (newOrder: string[]) => void;

  // === 章节管理 ===
  setCurrentChapter: (chapterId: string | null) => void;
  reorderChapters: (newOrder: string[]) => void;

  // === 脏状态管理 ===
  setDirty: (dirty: boolean) => void;
  markDirty: () => void;
  markClean: () => void;

  // === 绑定模式管理 ===
  enterBindingMode: () => void;
  exitBindingMode: () => void;
  bindDraftToChapter: (chapterId: string) => { success: boolean; conflictDraft?: Draft };
  forceBindDraftToChapter: (chapterId: string) => { success: boolean };
  unbindDraft: (draftId: string) => void;
  getDraftByChapterId: (chapterId: string) => Draft | undefined;

  // === 存档管理 ===
  createArchive: (guideId: string, guideInfo: GuideInfo) => GuideArchive;
  updateArchive: (guideId: string, patch: Partial<GuideArchive>) => void;
  deleteArchive: (guideId: string) => void;
  switchArchive: (guideId: string | null) => void;
  getArchive: (guideId: string) => GuideArchive | undefined;
  getCurrentArchive: () => GuideArchive | undefined;

  // === 存档章节管理 ===
  saveChaptersToArchive: (guideId: string, chapters: ChapterInfo[]) => void;

  // === 存档图片分组管理（已废弃） ===
  createImageGroup: (guideId: string, name: string, color?: string) => ImageGroup | null;
  updateImageGroup: (guideId: string, groupId: string, patch: Partial<ImageGroup>) => void;
  deleteImageGroup: (guideId: string, groupId: string) => void;
  addImageToGroup: (guideId: string, groupId: string, imageId: string) => void;
  removeImageFromGroup: (guideId: string, groupId: string, imageId: string) => void;

  // === 图片标签管理（新） ===
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

  // === 草稿与存档关联 ===
  getDraftsByArchive: (guideId: string | null) => Draft[];
  getUnlinkedDrafts: () => Draft[];
};

// ============================================================================
// 辅助变量
// ============================================================================

let deletedCache: Draft | null = null;

// ============================================================================
// Store 实现
// ============================================================================

export const useGuideStore = create<GuideState>()(
  persist(
    (set, get) => {
      loggers.store.verbose('Store 初始化');

      return {
        // === 初始状态 ===
        mode: 'offline',
        currentArchiveId: null,
        guideInfo: null,
        drafts: [],
        activeDraftId: null,
        currentChapterId: null,
        isDirty: false,
        isBindingMode: false,
        archives: {},

        // === 模式管理 ===
        setMode: (mode) => {
          set({ mode });
        },

        // === 指南信息管理 ===
        setGuideInfo: (info) => {
          const state = get();

          // 自动创建或更新存档
          if (info.id) {
            const existingArchive = state.archives[info.id];
            if (existingArchive) {
              // 更新存档
              set((s) => ({
                archives: {
                  ...s.archives,
                  [info.id]: {
                    ...existingArchive,
                    guideName: info.title,
                    coverUrl: info.coverUrl,
                    chapters: info.chapters,
                    chaptersUpdatedAt: Date.now(),
                    lastAccessedAt: Date.now()
                  }
                },
                guideInfo: info,
                mode: 'guide',
                currentArchiveId: info.id
              }));
            } else {
              // 创建新存档
              const newArchive: GuideArchive = {
                guideId: info.id,
                guideName: info.title,
                coverUrl: info.coverUrl,
                chapters: info.chapters,
                chaptersUpdatedAt: Date.now(),
                imageGroups: [],
                imageTags: [],
                imageTagMap: {},
                draftIds: [],
                createdAt: Date.now(),
                lastAccessedAt: Date.now()
              };
              set((s) => ({
                archives: {
                  ...s.archives,
                  [info.id]: newArchive
                },
                guideInfo: info,
                mode: 'guide',
                currentArchiveId: info.id
              }));
            }

            // 从存档加载缓存的图片（延迟导入避免循环依赖）
            import('./useSteamGuideImageStore').then(({ useSteamGuideImageStore }) => {
              useSteamGuideImageStore.getState().loadFromArchive(info.id);
            });

            // 切换到对应存档的草稿
            const archiveDrafts = state.drafts.filter(d => d.linkedGuideId === info.id);
            if (archiveDrafts.length > 0) {
              // 有草稿：选择最近更新的
              const mostRecentDraft = archiveDrafts.sort((a, b) => b.updatedAt - a.updatedAt)[0];
              set({ activeDraftId: mostRecentDraft.id });
              loggers.store.info('切换到存档草稿', { draftId: mostRecentDraft.id, draftName: mostRecentDraft.draftName });
            } else {
              // 没有草稿：清空当前草稿，显示"暂无草稿"引导
              set({ activeDraftId: null });
              loggers.store.info('存档无草稿', { guideId: info.id });
            }
          } else {
            set({ guideInfo: info, mode: 'guide' });
          }
        },

        clearGuideInfo: () => {
          set({ guideInfo: null, currentChapterId: null });
        },

        // 注意：setGuideInfo 内部会触发图片池加载
        // 这是通过动态导入实现的，避免循环依赖

        // === 草稿管理 ===
        selectDraft: (id) => {
          set({
            activeDraftId: id,
            isDirty: false
          });
        },

        addDraft: (title?: string) => {
          const state = get();
          const draftNumber = state.drafts.length + 1;
          const draft: Draft = {
            id: crypto.randomUUID(),
            draftName: `草稿 ${draftNumber}`,
            title: title ? createTitleFromText(title) : createEmptyTitle(),
            content: createEmptyDoc(),
            updatedAt: Date.now(),
            // 自动关联当前存档
            linkedGuideId: state.currentArchiveId || undefined
          };

          set((s) => ({
            drafts: [...s.drafts, draft],
            activeDraftId: draft.id,
            isDirty: false
          }));

          // 更新存档的 draftIds
          if (state.currentArchiveId) {
            const archive = state.archives[state.currentArchiveId];
            if (archive) {
              set((s) => ({
                archives: {
                  ...s.archives,
                  [state.currentArchiveId!]: {
                    ...archive,
                    draftIds: [...archive.draftIds, draft.id]
                  }
                }
              }));
            }
          }

          return draft;
        },

        updateDraft: (id, patch) => {
          set((state) => ({
            drafts: state.drafts.map((draft) =>
              draft.id === id
                ? { ...draft, ...patch, updatedAt: Date.now() }
                : draft
            ),
            isDirty: patch.content !== undefined ? true : state.isDirty
          }));
        },

        deleteDraft: (id) => {
          set((state) => {
            const remaining = state.drafts.filter((draft) => draft.id !== id);
            const removed = state.drafts.find((draft) => draft.id === id) ?? null;
            deletedCache = removed;

            return {
              drafts: remaining,
              activeDraftId:
                remaining.length === 0
                  ? null
                  : state.activeDraftId === id
                    ? remaining[remaining.length - 1].id
                    : state.activeDraftId,
              isDirty: false
            };
          });
        },

        duplicateDraft: (id) => {
          const state = get();
          const original = state.drafts.find((d) => d.id === id);
          if (!original) return null;

          const duplicated: Draft = {
            ...original,
            id: crypto.randomUUID(),
            draftName: `${original.draftName} (副本)`,
            updatedAt: Date.now(),
            linkedChapterId: undefined,
            lastSyncedAt: undefined
          };

          set((s) => ({
            drafts: [...s.drafts, duplicated],
            activeDraftId: duplicated.id,
            isDirty: false
          }));

          return duplicated;
        },

        restoreDraft: () => {
          if (!deletedCache) return;
          const draft = deletedCache;
          deletedCache = null;
          set((state) => ({
            drafts: [...state.drafts, draft],
            activeDraftId: draft.id,
            isDirty: false
          }));
        },

        reorderDrafts: (newOrder) => {
          set((state) => {
            const reorderedDrafts = newOrder
              .map(id => state.drafts.find((d) => d.id === id))
              .filter((d): d is Draft => d !== undefined);
            return { drafts: reorderedDrafts };
          });
        },

        // === 章节管理 ===
        setCurrentChapter: (chapterId) => {
          set({ currentChapterId: chapterId });
        },

        reorderChapters: (newOrder) => {
          set((state) => {
            if (!state.guideInfo) return state;

            const reorderedChapters = newOrder
              .map(sectionId => state.guideInfo!.chapters.find((c) => c.sectionId === sectionId))
              .filter((c): c is ChapterInfo => c !== undefined)
              .map((chapter, index) => ({ ...chapter, order: index }));

            return {
              guideInfo: {
                ...state.guideInfo,
                chapters: reorderedChapters
              }
            };
          });
        },

        // === 脏状态管理 ===
        setDirty: (dirty) => set({ isDirty: dirty }),
        markDirty: () => set({ isDirty: true }),
        markClean: () => set({ isDirty: false }),

        // === 绑定模式管理 ===
        enterBindingMode: () => {
          const state = get();
          if (state.mode !== 'guide' || !state.activeDraftId) {
            loggers.store.warn('无法进入绑定模式');
            return;
          }
          set({ isBindingMode: true });
        },

        exitBindingMode: () => {
          set({ isBindingMode: false });
        },

        bindDraftToChapter: (chapterId) => {
          const state = get();
          const activeDraftId = state.activeDraftId;
          const guideId = state.guideInfo?.id;

          if (!activeDraftId || !guideId) {
            return { success: false };
          }

          const conflictDraft = state.drafts.find(
            (d) => d.linkedChapterId === chapterId && d.id !== activeDraftId
          );

          if (conflictDraft) {
            return { success: false, conflictDraft };
          }

          set((s) => ({
            drafts: s.drafts.map((draft) =>
              draft.id === activeDraftId
                ? {
                    ...draft,
                    linkedChapterId: chapterId,
                    linkedGuideId: guideId,
                    updatedAt: Date.now()
                  }
                : draft
            ),
            isBindingMode: false,
            currentChapterId: chapterId
          }));

          return { success: true };
        },

        forceBindDraftToChapter: (chapterId) => {
          const state = get();
          const activeDraftId = state.activeDraftId;
          const guideId = state.guideInfo?.id;

          if (!activeDraftId || !guideId) {
            return { success: false };
          }

          set((s) => ({
            drafts: s.drafts.map((draft) => {
              if (draft.linkedChapterId === chapterId && draft.id !== activeDraftId) {
                return {
                  ...draft,
                  linkedChapterId: undefined,
                  linkedGuideId: undefined,
                  lastSyncedAt: undefined,
                  updatedAt: Date.now()
                };
              }
              if (draft.id === activeDraftId) {
                return {
                  ...draft,
                  linkedChapterId: chapterId,
                  linkedGuideId: guideId,
                  updatedAt: Date.now()
                };
              }
              return draft;
            }),
            isBindingMode: false,
            currentChapterId: chapterId
          }));

          return { success: true };
        },

        unbindDraft: (draftId) => {
          set((state) => ({
            drafts: state.drafts.map((draft) =>
              draft.id === draftId
                ? {
                    ...draft,
                    linkedChapterId: undefined,
                    linkedGuideId: undefined,
                    lastSyncedAt: undefined,
                    updatedAt: Date.now()
                  }
                : draft
            ),
            currentChapterId: null
          }));
        },

        getDraftByChapterId: (chapterId) => {
          return get().drafts.find((d) => d.linkedChapterId === chapterId);
        },

        // === 存档管理 ===
        createArchive: (guideId, guideInfo) => {
          const newArchive: GuideArchive = {
            guideId,
            guideName: guideInfo.title,
            coverUrl: guideInfo.coverUrl,
            chapters: guideInfo.chapters,
            chaptersUpdatedAt: Date.now(),
            imageGroups: [],
            imageTags: [],
            imageTagMap: {},
            draftIds: [],
            createdAt: Date.now(),
            lastAccessedAt: Date.now()
          };

          set((state) => ({
            archives: {
              ...state.archives,
              [guideId]: newArchive
            }
          }));

          loggers.store.info('创建存档', { guideId, guideName: guideInfo.title });
          return newArchive;
        },

        updateArchive: (guideId, patch) => {
          set((state) => {
            const archive = state.archives[guideId];
            if (!archive) return state;

            return {
              archives: {
                ...state.archives,
                [guideId]: { ...archive, ...patch }
              }
            };
          });
        },

        deleteArchive: (guideId) => {
          set((state) => {
            const { [guideId]: removed, ...remaining } = state.archives;
            return {
              archives: remaining,
              currentArchiveId: state.currentArchiveId === guideId ? null : state.currentArchiveId
            };
          });
          loggers.store.info('删除存档', { guideId });
        },

        switchArchive: (guideId) => {
          const state = get();

          if (guideId === null) {
            // 切换到离线模式
            set({
              currentArchiveId: null,
              guideInfo: null,
              mode: 'offline'
            });

            // 加载图片池（清空 Steam 图片，禁用自动 refresh）
            // 延迟导入避免循环依赖
            import('./useSteamGuideImageStore').then(({ useSteamGuideImageStore }) => {
              useSteamGuideImageStore.getState().loadFromArchive(null, false);
            });
            return;
          }

          const archive = state.archives[guideId];
          if (!archive) {
            loggers.store.warn('存档不存在', { guideId });
            return;
          }

          // 从存档恢复 guideInfo
          const guideInfo: GuideInfo = {
            id: archive.guideId,
            title: archive.guideName,
            coverUrl: archive.coverUrl,
            chapters: archive.chapters
          };

          set((s) => ({
            currentArchiveId: guideId,
            guideInfo,
            mode: 'guide',
            archives: {
              ...s.archives,
              [guideId]: {
                ...archive,
                lastAccessedAt: Date.now()
              }
            }
          }));

          // 从存档加载缓存的图片（禁用自动 refresh，避免获取错误数据）
          // 延迟导入避免循环依赖
          import('./useSteamGuideImageStore').then(({ useSteamGuideImageStore }) => {
            useSteamGuideImageStore.getState().loadFromArchive(guideId, false);
          });

          loggers.store.info('切换存档', { guideId, guideName: archive.guideName });
        },

        getArchive: (guideId) => {
          return get().archives[guideId];
        },

        getCurrentArchive: () => {
          const state = get();
          if (!state.currentArchiveId) return undefined;
          return state.archives[state.currentArchiveId];
        },

        // === 存档章节管理 ===
        saveChaptersToArchive: (guideId, chapters) => {
          set((state) => {
            const archive = state.archives[guideId];
            if (!archive) return state;

            return {
              archives: {
                ...state.archives,
                [guideId]: {
                  ...archive,
                  chapters,
                  chaptersUpdatedAt: Date.now()
                }
              }
            };
          });
        },

        // === 存档图片分组管理 ===
        createImageGroup: (guideId, name, color) => {
          const state = get();
          const archive = state.archives[guideId];
          if (!archive) return null;

          const newGroup: ImageGroup = {
            id: crypto.randomUUID(),
            name,
            color,
            imageIds: [],
            order: archive.imageGroups.length
          };

          set((s) => ({
            archives: {
              ...s.archives,
              [guideId]: {
                ...archive,
                imageGroups: [...archive.imageGroups, newGroup]
              }
            }
          }));

          return newGroup;
        },

        updateImageGroup: (guideId, groupId, patch) => {
          set((state) => {
            const archive = state.archives[guideId];
            if (!archive) return state;

            return {
              archives: {
                ...state.archives,
                [guideId]: {
                  ...archive,
                  imageGroups: archive.imageGroups.map((g) =>
                    g.id === groupId ? { ...g, ...patch } : g
                  )
                }
              }
            };
          });
        },

        deleteImageGroup: (guideId, groupId) => {
          set((state) => {
            const archive = state.archives[guideId];
            if (!archive) return state;

            return {
              archives: {
                ...state.archives,
                [guideId]: {
                  ...archive,
                  imageGroups: archive.imageGroups.filter((g) => g.id !== groupId)
                }
              }
            };
          });
        },

        addImageToGroup: (guideId, groupId, imageId) => {
          set((state) => {
            const archive = state.archives[guideId];
            if (!archive) return state;

            return {
              archives: {
                ...state.archives,
                [guideId]: {
                  ...archive,
                  imageGroups: archive.imageGroups.map((g) =>
                    g.id === groupId && !g.imageIds.includes(imageId)
                      ? { ...g, imageIds: [...g.imageIds, imageId] }
                      : g
                  )
                }
              }
            };
          });
        },

        removeImageFromGroup: (guideId, groupId, imageId) => {
          set((state) => {
            const archive = state.archives[guideId];
            if (!archive) return state;

            return {
              archives: {
                ...state.archives,
                [guideId]: {
                  ...archive,
                  imageGroups: archive.imageGroups.map((g) =>
                    g.id === groupId
                      ? { ...g, imageIds: g.imageIds.filter((id) => id !== imageId) }
                      : g
                  )
                }
              }
            };
          });
        },

        // === 图片标签管理（新） ===

        // 创建标签
        createTag: (guideId, name, color) => {
          const state = get();
          const archive = state.archives[guideId];
          if (!archive) return null;

          // 自动选择颜色：使用预设颜色，按顺序循环
          const usedColors = archive.imageTags.map(t => t.color);
          const availableColor = TAG_COLORS.find(c => !usedColors.includes(c)) || TAG_COLORS[archive.imageTags.length % TAG_COLORS.length];

          const newTag: ImageTag = {
            id: crypto.randomUUID(),
            name,
            color: color || availableColor,
            order: archive.imageTags.length
          };

          set((s) => ({
            archives: {
              ...s.archives,
              [guideId]: {
                ...archive,
                imageTags: [...archive.imageTags, newTag]
              }
            }
          }));

          loggers.store.info('创建标签', { guideId, tagName: name, tagId: newTag.id });
          return newTag;
        },

        // 更新标签
        updateTag: (guideId, tagId, patch) => {
          set((state) => {
            const archive = state.archives[guideId];
            if (!archive) return state;

            return {
              archives: {
                ...state.archives,
                [guideId]: {
                  ...archive,
                  imageTags: archive.imageTags.map((t) =>
                    t.id === tagId ? { ...t, ...patch } : t
                  )
                }
              }
            };
          });
        },

        // 删除标签（同时从所有图片移除该标签）
        deleteTag: (guideId, tagId) => {
          set((state) => {
            const archive = state.archives[guideId];
            if (!archive) return state;

            // 从 imageTagMap 中移除该标签
            const newTagMap: Record<string, string[]> = {};
            for (const [imageId, tagIds] of Object.entries(archive.imageTagMap)) {
              const filtered = tagIds.filter(id => id !== tagId);
              if (filtered.length > 0) {
                newTagMap[imageId] = filtered;
              }
              // 如果过滤后为空，则不保留该条目
            }

            return {
              archives: {
                ...state.archives,
                [guideId]: {
                  ...archive,
                  imageTags: archive.imageTags.filter((t) => t.id !== tagId),
                  imageTagMap: newTagMap
                }
              }
            };
          });
          loggers.store.info('删除标签', { guideId, tagId });
        },

        // 重新排序标签
        reorderTags: (guideId, tagIds) => {
          set((state) => {
            const archive = state.archives[guideId];
            if (!archive) return state;

            const reorderedTags = tagIds
              .map((id, index) => {
                const tag = archive.imageTags.find(t => t.id === id);
                return tag ? { ...tag, order: index } : null;
              })
              .filter((t): t is ImageTag => t !== null);

            return {
              archives: {
                ...state.archives,
                [guideId]: {
                  ...archive,
                  imageTags: reorderedTags
                }
              }
            };
          });
        },

        // 为图片添加标签
        addTagToImage: (guideId, imageId, tagId) => {
          set((state) => {
            const archive = state.archives[guideId];
            if (!archive) return state;

            // 检查标签是否存在
            if (!archive.imageTags.some(t => t.id === tagId)) return state;

            const currentTags = archive.imageTagMap[imageId] || [];
            if (currentTags.includes(tagId)) return state; // 已有该标签

            return {
              archives: {
                ...state.archives,
                [guideId]: {
                  ...archive,
                  imageTagMap: {
                    ...archive.imageTagMap,
                    [imageId]: [...currentTags, tagId]
                  }
                }
              }
            };
          });
        },

        // 从图片移除标签
        removeTagFromImage: (guideId, imageId, tagId) => {
          set((state) => {
            const archive = state.archives[guideId];
            if (!archive) return state;

            const currentTags = archive.imageTagMap[imageId] || [];
            const newTags = currentTags.filter(id => id !== tagId);

            const newTagMap = { ...archive.imageTagMap };
            if (newTags.length > 0) {
              newTagMap[imageId] = newTags;
            } else {
              delete newTagMap[imageId];
            }

            return {
              archives: {
                ...state.archives,
                [guideId]: {
                  ...archive,
                  imageTagMap: newTagMap
                }
              }
            };
          });
        },

        // 设置图片的所有标签（替换）
        setImageTags: (guideId, imageId, tagIds) => {
          set((state) => {
            const archive = state.archives[guideId];
            if (!archive) return state;

            // 只保留存在的标签
            const validTagIds = tagIds.filter(id => archive.imageTags.some(t => t.id === id));

            const newTagMap = { ...archive.imageTagMap };
            if (validTagIds.length > 0) {
              newTagMap[imageId] = validTagIds;
            } else {
              delete newTagMap[imageId];
            }

            return {
              archives: {
                ...state.archives,
                [guideId]: {
                  ...archive,
                  imageTagMap: newTagMap
                }
              }
            };
          });
        },

        // 获取图片的所有标签
        getTagsForImage: (guideId, imageId) => {
          const state = get();
          const archive = state.archives[guideId];
          if (!archive) return [];

          const tagIds = archive.imageTagMap[imageId] || [];
          return tagIds
            .map(id => archive.imageTags.find(t => t.id === id))
            .filter((t): t is ImageTag => t !== undefined)
            .sort((a, b) => a.order - b.order);
        },

        // 获取某标签下的所有图片 ID
        getImageIdsByTag: (guideId, tagId) => {
          const state = get();
          const archive = state.archives[guideId];
          if (!archive) return [];

          return Object.entries(archive.imageTagMap)
            .filter(([_, tagIds]) => tagIds.includes(tagId))
            .map(([imageId]) => imageId);
        },

        // 获取没有任何标签的图片 ID
        getUntaggedImageIds: (guideId) => {
          const state = get();
          const archive = state.archives[guideId];
          if (!archive) return [];

          // 获取所有缓存的图片 ID
          const allImageIds = (archive.cachedImages || []).map(img => img.previewId);

          // 过滤出没有标签的图片
          return allImageIds.filter(id => {
            const tags = archive.imageTagMap[id];
            return !tags || tags.length === 0;
          });
        },

        // === 草稿与存档关联 ===
        getDraftsByArchive: (guideId) => {
          const state = get();
          if (guideId === null) {
            return state.drafts.filter((d) => !d.linkedGuideId);
          }
          return state.drafts.filter((d) => d.linkedGuideId === guideId);
        },

        getUnlinkedDrafts: () => {
          return get().drafts.filter((d) => !d.linkedGuideId);
        }
      };
    },
    {
      name: "nasge-guide-store-v2",  // 新键名，与旧数据隔离
      version: 1,
      storage: (() => {
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        let pendingValue: { name: string; value: unknown } | null = null;

        const debouncedSetItem = (name: string, value: unknown) => {
          pendingValue = { name, value };

          if (debounceTimer) {
            clearTimeout(debounceTimer);
          }

          debounceTimer = setTimeout(() => {
            if (pendingValue) {
              const valueStr = typeof pendingValue.value === 'string'
                ? pendingValue.value
                : JSON.stringify(pendingValue.value);
              loggers.persist.verbose('setItem (debounced)', { name: pendingValue.name });
              localStorage.setItem(pendingValue.name, valueStr);
              pendingValue = null;
              debounceTimer = null;
            }
          }, 500);
        };

        return {
          getItem: (name: string) => {
            const str = localStorage.getItem(name);
            if (!str) return null;
            try {
              return JSON.parse(str);
            } catch {
              return null;
            }
          },
          setItem: debouncedSetItem,
          removeItem: (name: string) => {
            localStorage.removeItem(name);
          }
        };
      })(),

      merge: (persistedState: unknown, currentState: GuideState) => {
        const persisted = persistedState as Partial<GuideState> | null;

        if (!persisted) {
          return currentState;
        }

        // 合并数据字段，保留函数
        return {
          // 数据字段
          mode: persisted.mode ?? currentState.mode,
          currentArchiveId: persisted.currentArchiveId ?? currentState.currentArchiveId,
          guideInfo: persisted.guideInfo ?? currentState.guideInfo,
          drafts: persisted.drafts ?? currentState.drafts,
          activeDraftId: persisted.activeDraftId ?? currentState.activeDraftId,
          currentChapterId: persisted.currentChapterId ?? currentState.currentChapterId,
          isDirty: persisted.isDirty ?? currentState.isDirty,
          isBindingMode: false,  // 运行时状态，不恢复
          archives: persisted.archives ?? currentState.archives,

          // 函数（从 currentState 保留）
          setMode: currentState.setMode,
          setGuideInfo: currentState.setGuideInfo,
          clearGuideInfo: currentState.clearGuideInfo,
          selectDraft: currentState.selectDraft,
          addDraft: currentState.addDraft,
          updateDraft: currentState.updateDraft,
          deleteDraft: currentState.deleteDraft,
          duplicateDraft: currentState.duplicateDraft,
          restoreDraft: currentState.restoreDraft,
          reorderDrafts: currentState.reorderDrafts,
          setCurrentChapter: currentState.setCurrentChapter,
          reorderChapters: currentState.reorderChapters,
          setDirty: currentState.setDirty,
          markDirty: currentState.markDirty,
          markClean: currentState.markClean,
          enterBindingMode: currentState.enterBindingMode,
          exitBindingMode: currentState.exitBindingMode,
          bindDraftToChapter: currentState.bindDraftToChapter,
          forceBindDraftToChapter: currentState.forceBindDraftToChapter,
          unbindDraft: currentState.unbindDraft,
          getDraftByChapterId: currentState.getDraftByChapterId,
          createArchive: currentState.createArchive,
          updateArchive: currentState.updateArchive,
          deleteArchive: currentState.deleteArchive,
          switchArchive: currentState.switchArchive,
          getArchive: currentState.getArchive,
          getCurrentArchive: currentState.getCurrentArchive,
          saveChaptersToArchive: currentState.saveChaptersToArchive,
          createImageGroup: currentState.createImageGroup,
          updateImageGroup: currentState.updateImageGroup,
          deleteImageGroup: currentState.deleteImageGroup,
          addImageToGroup: currentState.addImageToGroup,
          removeImageFromGroup: currentState.removeImageFromGroup,
          // 新增：图片标签管理
          createTag: currentState.createTag,
          updateTag: currentState.updateTag,
          deleteTag: currentState.deleteTag,
          reorderTags: currentState.reorderTags,
          addTagToImage: currentState.addTagToImage,
          removeTagFromImage: currentState.removeTagFromImage,
          setImageTags: currentState.setImageTags,
          getTagsForImage: currentState.getTagsForImage,
          getImageIdsByTag: currentState.getImageIdsByTag,
          getUntaggedImageIds: currentState.getUntaggedImageIds,
          getDraftsByArchive: currentState.getDraftsByArchive,
          getUnlinkedDrafts: currentState.getUnlinkedDrafts
        } as GuideState;
      },

      migrate: (persistedState: unknown, version: number) => {
        loggers.persist.verbose('数据迁移', { version });

        const state = persistedState as Partial<GuideState> | null;

        // 如果没有数据，创建默认状态
        if (!state || !state.drafts || state.drafts.length === 0) {
          const defaultDraft: Draft = {
            id: crypto.randomUUID(),
            draftName: "草稿 1",
            title: createEmptyTitle(),
            content: createEmptyDoc(),
            updatedAt: Date.now()
          };

          return {
            mode: 'offline',
            currentArchiveId: null,
            guideInfo: null,
            drafts: [defaultDraft],
            activeDraftId: defaultDraft.id,
            currentChapterId: null,
            isDirty: false,
            isBindingMode: false,
            archives: {}
          };
        }

        // 迁移旧存档：添加缺失的 imageTags 和 imageTagMap 字段
        if (state.archives) {
          const migratedArchives: Record<string, GuideArchive> = {};
          for (const [guideId, archive] of Object.entries(state.archives)) {
            migratedArchives[guideId] = {
              ...archive,
              // 确保新字段存在
              imageTags: (archive as GuideArchive).imageTags || [],
              imageTagMap: (archive as GuideArchive).imageTagMap || {}
            };
          }
          state.archives = migratedArchives;
        }

        return state;
      },

      onRehydrateStorage: () => {
        return (state, error) => {
          if (error) {
            loggers.persist.error('rehydration 失败', error);
          } else {
            loggers.persist.verbose('rehydration 完成', {
              draftsCount: state?.drafts?.length,
              archivesCount: Object.keys(state?.archives || {}).length
            });
          }
        };
      }
    }
  )
);

// 启动时确保有默认草稿
setTimeout(() => {
  const state = useGuideStore.getState();
  if (state.drafts.length === 0) {
    state.addDraft();
  } else if (!state.activeDraftId && state.drafts.length > 0) {
    useGuideStore.setState({ activeDraftId: state.drafts[0].id });
  }
}, 100);
