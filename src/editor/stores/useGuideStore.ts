"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { bbcodeToHtml } from "../utils/bbcode";
import { JSONContent } from "@tiptap/core";
import { createEditorExtensions, createEmptyDoc } from "../utils/editorExtensions";
import { generateJSON } from "@tiptap/html";
import { createTitleFromText, createEmptyTitle } from "../utils/titleHelpers";
import { loggers } from "../../shared/logger";

/**
 * 编辑器模式
 * - guide: 指南模式（完整功能：章节、图片池等）
 * - review: 评测模式（简化版：仅文字编辑）
 * - offline: 离线模式（草稿模式：无 Steam 连接）
 */
export type EditorMode = 'guide' | 'review' | 'offline';

/**
 * 章节信息（从 Steam 导入）
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
 * 草稿（本地编辑的内容）
 */
export type Draft = {
  id: string;
  draftName: string;        // 草稿名（本地管理用，如"草稿 1"）
  title: JSONContent;       // 章节标题（JSON格式，支持图片等富文本）
  content: JSONContent;
  updatedAt: number;
  linkedChapterId?: string; // 关联的 Steam 章节 ID (sectionId)
  linkedGuideId?: string;   // 关联的 Steam 指南 ID
  lastSyncedAt?: number;    // 最后同步到 Steam 的时间
};

/**
 * @deprecated 向后兼容的类型别名，将在未来版本移除
 */
export type ChapterDraft = Draft;

type GuideState = {
  // 编辑器模式
  mode: EditorMode;

  // 指南信息（从 Steam 导入）
  guideInfo: GuideInfo | null;

  // 草稿列表（本地存储）
  drafts: Draft[];

  // 当前激活的草稿 ID
  activeDraftId: string | null;

  // 当前选中的章节 ID（用于高亮显示）
  currentChapterId: string | null;

  // 是否有未保存的更改
  isDirty: boolean;

  // === 绑定模式 ===
  // 是否处于绑定模式（等待用户选择章节）
  isBindingMode: boolean;

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

  // === 向后兼容的别名（将在未来版本移除）===
  /** @deprecated 使用 drafts 替代 */
  chapters: Draft[];
  /** @deprecated 使用 activeDraftId 替代 */
  activeId: string | null;
  /** @deprecated 使用 selectDraft 替代 */
  selectChapter: (id: string) => void;
  /** @deprecated 使用 addDraft 替代 */
  addChapter: () => Draft;
  /** @deprecated 使用 updateDraft 替代 */
  updateChapter: (id: string, patch: Partial<Draft>) => void;
  /** @deprecated 使用 deleteDraft 替代 */
  deleteChapter: (id: string) => void;
  /** @deprecated 使用 restoreDraft 替代 */
  restoreChapter: () => void;
};

let deletedCache: Draft | null = null;

export const useGuideStore = create<GuideState>()(
  persist(
    (set, get) => {
      loggers.store.verbose('Store 初始化开始');

      return {
        // 初始状态（persist 会覆盖这些值）
        mode: 'offline',
        guideInfo: null,
        drafts: [], // 空数组，persist 会恢复真实数据
        activeDraftId: null,
        currentChapterId: null,
        isDirty: false,
        isBindingMode: false,

      // === 模式管理 ===
      setMode: (mode) => {
        set({ mode });
      },

      // === 指南信息管理 ===
      setGuideInfo: (info) => {
        set({ guideInfo: info, mode: 'guide' });
      },

      clearGuideInfo: () => {
        set({ guideInfo: null, currentChapterId: null });
      },

      // === 草稿管理 ===
      selectDraft: (id) => {
        const state = get();

        // 如果有未保存的更改，这里将来可以添加警告
        // 现在先简单切换
        set({
          activeDraftId: id,
          isDirty: false
        });
      },

      addDraft: (title?: string) => {
        const draftNumber = get().drafts.length + 1;
        const draft: Draft = {
          id: crypto.randomUUID(),
          draftName: `草稿 ${draftNumber}`,  // 草稿名
          title: title ? createTitleFromText(title) : createEmptyTitle(),  // 章节标题（JSON格式）
          content: createEmptyDoc(),
          updatedAt: Date.now()
        };
        set((state) => ({
          drafts: [...state.drafts, draft],
          activeDraftId: draft.id,
          isDirty: false
        }));
        return draft;
      },

      updateDraft: (id, patch) => {
        set((state) => ({
          drafts: state.drafts.map((draft: Draft) =>
            draft.id === id
              ? {
                  ...draft,
                  ...patch,
                  updatedAt: Date.now()
                }
              : draft
          ),
          // 如果更新的是内容，标记为脏
          isDirty: patch.content !== undefined ? true : state.isDirty
        }));
      },

      deleteDraft: (id) => {
        set((state) => {
          const remaining = state.drafts.filter((draft: Draft) => draft.id !== id);
          const removed = state.drafts.find((draft: Draft) => draft.id === id) ?? null;
          deletedCache = removed;

          // 允许删除最后一个草稿，回到初始状态
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
        const original = state.drafts.find((d: Draft) => d.id === id);
        if (!original) return null;

        const duplicated: Draft = {
          ...original,
          id: crypto.randomUUID(),
          draftName: `${original.draftName} (副本)`,
          updatedAt: Date.now(),
          linkedChapterId: undefined, // 副本不关联章节
          lastSyncedAt: undefined
        };

        set((state) => ({
          drafts: [...state.drafts, duplicated],
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
            .map(id => state.drafts.find((d: Draft) => d.id === id))
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
            .map(sectionId => state.guideInfo!.chapters.find((c: ChapterInfo) => c.sectionId === sectionId))
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
      setDirty: (dirty) => {
        set({ isDirty: dirty });
      },

      markDirty: () => {
        set({ isDirty: true });
      },

      markClean: () => {
        set({ isDirty: false });
      },

      // === 绑定模式管理 ===
      enterBindingMode: () => {
        const state = get();
        // 只有在指南模式且有活动草稿时才能进入绑定模式
        if (state.mode !== 'guide' || !state.activeDraftId) {
          loggers.store.warn('无法进入绑定模式：需要在指南模式下且有活动草稿');
          return;
        }
        set({ isBindingMode: true });
        loggers.store.info('进入绑定模式');
      },

      exitBindingMode: () => {
        set({ isBindingMode: false });
        loggers.store.info('退出绑定模式');
      },

      bindDraftToChapter: (chapterId) => {
        const state = get();
        const activeDraftId = state.activeDraftId;
        const guideId = state.guideInfo?.id;

        if (!activeDraftId || !guideId) {
          loggers.store.warn('绑定失败：没有活动草稿或指南信息');
          return { success: false };
        }

        // 检查是否有其他草稿已绑定到此章节
        const conflictDraft = state.drafts.find(
          (d) => d.linkedChapterId === chapterId && d.id !== activeDraftId
        );

        if (conflictDraft) {
          // 返回冲突信息，让 UI 层决定是否继续
          return { success: false, conflictDraft };
        }

        // 执行绑定
        set((state) => ({
          drafts: state.drafts.map((draft) =>
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

        loggers.store.info('绑定成功', { draftId: activeDraftId, chapterId });
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
        loggers.store.info('解除绑定', { draftId });
      },

      getDraftByChapterId: (chapterId) => {
        return get().drafts.find((d) => d.linkedChapterId === chapterId);
      },

      // 强制绑定（解除旧绑定并绑定新草稿）
      forceBindDraftToChapter: (chapterId: string) => {
        const state = get();
        const activeDraftId = state.activeDraftId;
        const guideId = state.guideInfo?.id;

        if (!activeDraftId || !guideId) {
          return { success: false };
        }

        set((state) => ({
          drafts: state.drafts.map((draft) => {
            // 解除旧绑定
            if (draft.linkedChapterId === chapterId && draft.id !== activeDraftId) {
              return {
                ...draft,
                linkedChapterId: undefined,
                linkedGuideId: undefined,
                lastSyncedAt: undefined,
                updatedAt: Date.now()
              };
            }
            // 绑定当前草稿
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

        loggers.store.info('强制绑定成功', { draftId: activeDraftId, chapterId });
        return { success: true };
      },

      // === 向后兼容的别名 ===
      get chapters() {
        return get().drafts;
      },
      get activeId() {
        return get().activeDraftId;
      },
      selectChapter: (id) => get().selectDraft(id),
      addChapter: () => get().addDraft(),
      updateChapter: (id, patch) => get().updateDraft(id, patch),
      deleteChapter: (id) => get().deleteDraft(id),
      restoreChapter: () => get().restoreDraft()
      };
    },
    {
      name: "nasge-guide-drafts",
      version: 7, // v7: title 从 string 改为 JSONContent
      storage: (() => {
        // 创建防抖的 setItem，避免每次输入都触发持久化
        let debounceTimer: NodeJS.Timeout | null = null;
        let pendingValue: { name: string; value: any } | null = null;

        const debouncedSetItem = (name: string, value: any) => {
          pendingValue = { name, value };

          // 清除之前的定时器
          if (debounceTimer) {
            clearTimeout(debounceTimer);
          }

          // 500ms 后执行实际的持久化
          debounceTimer = setTimeout(() => {
            if (pendingValue) {
              const valueStr = typeof pendingValue.value === 'string'
                ? pendingValue.value
                : JSON.stringify(pendingValue.value);
              loggers.persist.verbose('setItem (debounced)', {
                name: pendingValue.name,
                length: valueStr.length
              });
              localStorage.setItem(pendingValue.name, valueStr);
              pendingValue = null;
              debounceTimer = null;
            }
          }, 500); // 500ms 防抖延迟
        };

        return {
          getItem: (name: string) => {
            const str = localStorage.getItem(name);
            loggers.persist.verbose('getItem', { name, exists: !!str, length: str?.length });
            if (!str) return null;
            try {
              const parsed = JSON.parse(str);
              loggers.persist.verbose('getItem parsed', {
                version: parsed.version,
                hasState: !!parsed.state,
                stateDraftsCount: parsed.state?.drafts?.length
              });
              return parsed;
            } catch (e) {
              loggers.persist.error('getItem parse error', e);
              return null;
            }
          },
          setItem: debouncedSetItem,
          removeItem: (name: string) => {
            loggers.persist.verbose('removeItem', { name });
            localStorage.removeItem(name);
          }
        };
      })(),
      // 关键修复：使用自定义 merge 策略，确保持久化数据完全覆盖初始状态
      // 但保留 currentState 中的函数引用（函数不会被序列化）
      merge: (persistedState: any, currentState: GuideState) => {
        try {
          loggers.persist.verbose('merge 调用', {
            persistedStateKeys: Object.keys(persistedState || {}),
            persistedDraftsCount: persistedState?.drafts?.length,
            currentDraftsCount: currentState.drafts?.length,
            persistedPreview: persistedState ? JSON.stringify(persistedState).substring(0, 200) : 'null'
          });

          // Zustand persist 会自动从 { state: {...}, version } 中提取 state
          // 所以这里收到的 persistedState 就是之前保存的 state 对象
          if (persistedState && persistedState.drafts && Array.isArray(persistedState.drafts)) {
            loggers.persist.verbose('merge 成功恢复草稿', {
              draftsCount: persistedState.drafts.length,
              draftTitles: persistedState.drafts.map((d: any) => d.title)
            });

            // 验证 guideInfo 的完整性
            let safeGuideInfo = persistedState.guideInfo;
            if (safeGuideInfo && !safeGuideInfo.chapters) {
              loggers.persist.warn('guideInfo 缺少 chapters，设为 null');
              safeGuideInfo = null;
            }

            // 只恢复数据字段，保留 currentState 中的函数
            // 这样可以避免 "t is not a function" 错误
            //
            // 🔧 重要：不能使用 ...currentState，因为它会复制 getter 属性
            // getter 内部调用 get() 可能导致在 merge 过程中访问不完整的状态
            const mergedState = {
              // 数据字段（从 persistedState 恢复）
              mode: persistedState.mode ?? currentState.mode,
              guideInfo: safeGuideInfo ?? currentState.guideInfo,
              drafts: persistedState.drafts ?? currentState.drafts,
              activeDraftId: persistedState.activeDraftId ?? currentState.activeDraftId,
              currentChapterId: persistedState.currentChapterId ?? currentState.currentChapterId,
              isDirty: persistedState.isDirty ?? currentState.isDirty,

              // 方法函数（从 currentState 保留）
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

              // 向后兼容的 getter（从 currentState 保留）
              get chapters() {
                return mergedState.drafts;
              },
              get activeId() {
                return mergedState.activeDraftId;
              },

              // 向后兼容的方法别名
              selectChapter: currentState.selectChapter,
              addChapter: currentState.addChapter,
              updateChapter: currentState.updateChapter,
              deleteChapter: currentState.deleteChapter,
              restoreChapter: currentState.restoreChapter
            };

            return mergedState as GuideState;
          }

          loggers.persist.warn('merge 未找到草稿数据，使用初始状态');
          return currentState;
        } catch (error) {
          loggers.persist.error('merge 发生错误，使用初始状态', error);
          return currentState;
        }
      },
      onRehydrateStorage: () => {
        loggers.persist.verbose('开始 rehydration');
        return (state, error) => {
          if (error) {
            loggers.persist.error('rehydration 失败', error);
          } else {
            loggers.persist.verbose('rehydration 完成', {
              draftsCount: state?.drafts?.length,
              activeDraftId: state?.activeDraftId,
              mode: state?.mode
            });
          }
        };
      },
      migrate: (persistedState: any, version) => {
        loggers.persist.verbose('数据迁移开始', {
          version,
          hasPersistedState: !!persistedState,
          persistedDraftsCount: persistedState?.drafts?.length,
          persistedDraftTitles: persistedState?.drafts?.map((d: any) => d.title)
        });

        if (!persistedState) {
          loggers.persist.verbose('无持久化数据，创建默认草稿');
          // 没有持久化数据，返回一个包含默认草稿的初始状态
          const defaultDraft = {
            id: crypto.randomUUID(),
            draftName: "草稿 1",
            title: createEmptyTitle(),
            content: createEmptyDoc(),
            updatedAt: Date.now()
          };
          return {
            mode: 'offline',
            guideInfo: null,
            drafts: [defaultDraft],
            activeDraftId: defaultDraft.id,
            currentChapterId: null,
            isDirty: false
          };
        }

        // v5 -> v6: 分离 draftName 和 title
        if (version >= 4 && version < 6) {
          loggers.persist.verbose('v5 -> v6 迁移：分离 draftName 和 title', {
            draftsCount: persistedState.drafts?.length
          });

          // 确保 drafts 数组存在且有效
          if (!persistedState.drafts || !Array.isArray(persistedState.drafts)) {
            loggers.persist.warn('检测到无效的 drafts 数据，创建默认草稿');
            const defaultDraft = {
              id: crypto.randomUUID(),
              draftName: "草稿 1",
              title: createEmptyTitle(),
              content: createEmptyDoc(),
              updatedAt: Date.now()
            };
            persistedState.drafts = [defaultDraft];
            persistedState.activeDraftId = defaultDraft.id;
          } else if (persistedState.drafts.length === 0) {
            loggers.persist.warn('drafts 为空数组，创建默认草稿');
            const defaultDraft = {
              id: crypto.randomUUID(),
              draftName: "草稿 1",
              title: createEmptyTitle(),
              content: createEmptyDoc(),
              updatedAt: Date.now()
            };
            persistedState.drafts = [defaultDraft];
            persistedState.activeDraftId = defaultDraft.id;
          } else {
            // 迁移现有草稿：将 title 复制为 draftName，并转换为 JSONContent
            persistedState.drafts = persistedState.drafts.map((draft: any, index: number) => ({
              ...draft,
              draftName: draft.title || `草稿 ${index + 1}`,
              title: draft.title ? createTitleFromText(draft.title) : createEmptyTitle()
            }));
          }

          return persistedState;
        }

        // v6 -> v7: title 从 string 改为 JSONContent
        if (version >= 6 && version < 7) {
          loggers.persist.verbose('v6 -> v7 迁移：title 从 string 改为 JSONContent', {
            draftsCount: persistedState.drafts?.length
          });

          // 确保 drafts 数组存在
          if (!persistedState.drafts || !Array.isArray(persistedState.drafts) || persistedState.drafts.length === 0) {
            const defaultDraft = {
              id: crypto.randomUUID(),
              draftName: "草稿 1",
              title: createEmptyTitle(),
              content: createEmptyDoc(),
              updatedAt: Date.now()
            };
            persistedState.drafts = [defaultDraft];
            persistedState.activeDraftId = defaultDraft.id;
          } else {
            // 迁移现有草稿：将 string 标题转换为 JSONContent
            persistedState.drafts = persistedState.drafts.map((draft: any, index: number) => {
              // 如果 title 已经是对象（JSON），说明已经迁移过了
              if (typeof draft.title === 'object' && draft.title !== null && 'type' in draft.title) {
                return draft;
              }

              // 将字符串标题转换为 JSONContent
              const titleStr = typeof draft.title === 'string' ? draft.title : '';
              loggers.persist.verbose(`迁移草稿 ${index + 1} 标题: "${titleStr}"`);

              return {
                ...draft,
                title: titleStr ? createTitleFromText(titleStr) : createEmptyTitle()
              };
            });
          }

          return persistedState;
        }

        // v7+: 已经是最新版本
        if (version >= 7) {
          // 确保 drafts 数组存在
          if (!persistedState.drafts || !Array.isArray(persistedState.drafts) || persistedState.drafts.length === 0) {
            const defaultDraft = {
              id: crypto.randomUUID(),
              draftName: "草稿 1",
              title: createEmptyTitle(),
              content: createEmptyDoc(),
              updatedAt: Date.now()
            };
            persistedState.drafts = [defaultDraft];
            persistedState.activeDraftId = defaultDraft.id;
          }
          return persistedState;
        }

        const extensions = createEditorExtensions();

        // v1 -> v2: BBCode 转 HTML
        if (version < 2 && persistedState.chapters) {
          loggers.persist.verbose('执行 v1 -> v2 迁移：BBCode 转 HTML');
          persistedState.chapters = persistedState.chapters.map((chapter: any) => {
            const bbcode = typeof chapter.bbcode === "string" ? chapter.bbcode : "";
            const html = bbcode ? bbcodeToHtml(bbcode) : "";
            return {
              ...chapter,
              content: toJSONContent(html, extensions)
            };
          });
        }

        // v2 -> v3: HTML 转 JSONContent
        if (version < 3 && persistedState.chapters) {
          loggers.persist.verbose('执行 v2 -> v3 迁移：HTML 转 JSONContent');
          persistedState.chapters = persistedState.chapters.map((chapter: any) => {
            if (chapter && typeof chapter.content === "object" && chapter.content !== null && "type" in chapter.content) {
              return chapter;
            }

            const html = typeof chapter.content === "string" ? chapter.content : "";
            return {
              ...chapter,
              content: toJSONContent(html, extensions)
            };
          });
        }

        // v3 -> v4: 重命名 chapters 为 drafts，添加新字段
        if (version < 4) {
          loggers.persist.verbose('执行 v3 -> v4 迁移：chapters 改为 drafts');
          const oldChapters = persistedState.chapters || [];
          const oldActiveId = persistedState.activeId || null;

          // 迁移旧的 chapters 到新的 drafts 结构
          const migratedDrafts = oldChapters.length > 0
            ? oldChapters.map((chapter: any, index: number) => ({
                id: chapter.id,
                title: chapter.title || `草稿 ${index + 1}`,
                content: chapter.content || createEmptyDoc(),
                updatedAt: chapter.updatedAt || Date.now(),
                linkedChapterId: chapter.steamSectionId || undefined,
                linkedGuideId: chapter.steamGuideId || undefined,
                lastSyncedAt: chapter.lastSyncedAt || undefined
              }))
            : [{
                id: crypto.randomUUID(),
                title: "草稿 1",
                content: createEmptyDoc(),
                updatedAt: Date.now()
              }];

          persistedState.drafts = migratedDrafts;

          // 迁移其他字段
          // 如果 oldActiveId 有效则使用，否则使用第一个草稿的 ID
          persistedState.activeDraftId = oldActiveId || (migratedDrafts.length > 0 ? migratedDrafts[0].id : null);
          persistedState.mode = persistedState.mode || 'offline';
          persistedState.guideInfo = persistedState.guideInfo || null;
          persistedState.currentChapterId = null;
          persistedState.isDirty = false;

          // 删除旧字段
          delete persistedState.chapters;
          delete persistedState.activeId;

          loggers.persist.verbose('v3 -> v4 迁移完成', {
            draftsCount: persistedState.drafts.length,
            activeDraftId: persistedState.activeDraftId
          });
        }

        loggers.persist.verbose('数据迁移完成', persistedState);
        return persistedState;
      }
    }
  )
);

// 立即订阅 store 以触发持久化初始化
useGuideStore.subscribe((state) => {
  loggers.store.verbose('Store 状态更新', {
    draftsCount: state.drafts.length,
    activeDraftId: state.activeDraftId,
    mode: state.mode,
    draftTitles: state.drafts.map(d => d.title)
  });

  // 调试：检查 localStorage 中的实际数据
  try {
    const stored = localStorage.getItem('nasge-guide-drafts');
    if (stored) {
      const parsed = JSON.parse(stored);
      loggers.store.verbose('LocalStorage 实际保存的数据', {
        version: parsed.version,
        draftsCount: parsed.state?.drafts?.length,
        draftTitles: parsed.state?.drafts?.map((d: any) => d.title)
      });
    }
  } catch (e) {
    loggers.store.error('读取 localStorage 失败', e);
  }
});

// 触发一次获取以确保持久化初始化
setTimeout(() => {
  const state = useGuideStore.getState();
  loggers.store.verbose('Store 初始状态', {
    draftsCount: state.drafts.length,
    mode: state.mode,
    hasGuideInfo: !!state.guideInfo
  });

  // 手动触发一次状态更新以强制持久化
  if (state.drafts.length > 0 && !state.activeDraftId) {
    loggers.store.verbose('设置默认激活草稿');
    useGuideStore.setState({ activeDraftId: state.drafts[0].id });
  }

  // 验证持久化
  setTimeout(() => {
    const persisted = localStorage.getItem('nasge-guide-drafts');
    loggers.store.verbose('持久化验证', {
      hasPersisted: !!persisted,
      persistedData: persisted ? JSON.parse(persisted) : null
    });
  }, 200);
}, 100);

function toJSONContent(html: string, extensions: ReturnType<typeof createEditorExtensions>): JSONContent {
  if (!html) {
    return createEmptyDoc();
  }

  try {
    return generateJSON(html, extensions);
  } catch {
    return createEmptyDoc();
  }
}
