"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { bbcodeToHtml } from "../utils/bbcode";
import { JSONContent } from "@tiptap/core";
import { createEditorExtensions, createEmptyDoc } from "../utils/editorExtensions";
import { generateJSON } from "@tiptap/html";
import { createTitleFromText, createEmptyTitle } from "../utils/titleHelpers";

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
 * 标题样式
 */
export type TitleStyle = 'short' | 'long';

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
  titleStyle?: TitleStyle;  // 标题样式偏好（默认 'short'）
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
      console.log('[NASGE] Store 初始化开始');

      return {
        // 初始状态（persist 会覆盖这些值）
        mode: 'offline',
        guideInfo: null,
        drafts: [], // 空数组，persist 会恢复真实数据
        activeDraftId: null,
        currentChapterId: null,
        isDirty: false,

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
          drafts: state.drafts.map((draft) =>
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
          const remaining = state.drafts.filter((draft) => draft.id !== id);
          const removed = state.drafts.find((draft) => draft.id === id) ?? null;
          deletedCache = removed;

          // 如果没有草稿了，保留最后一个
          if (remaining.length === 0) {
            return state;
          }

          return {
            drafts: remaining,
            activeDraftId:
              state.activeDraftId === id
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
            .map(id => state.drafts.find(d => d.id === id))
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
            .map(sectionId => state.guideInfo!.chapters.find(c => c.sectionId === sectionId))
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
      storage: {
        getItem: (name: string) => {
          const str = localStorage.getItem(name);
          console.log('[NASGE Persist] getItem', { name, exists: !!str, length: str?.length });
          if (!str) return null;
          try {
            const parsed = JSON.parse(str);
            console.log('[NASGE Persist] getItem parsed', {
              version: parsed.version,
              hasState: !!parsed.state,
              stateDraftsCount: parsed.state?.drafts?.length
            });
            return parsed;
          } catch (e) {
            console.error('[NASGE Persist] getItem parse error', e);
            return null;
          }
        },
        setItem: (name: string, value: any) => {
          const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
          console.log('[NASGE Persist] setItem', { name, length: valueStr.length });
          localStorage.setItem(name, valueStr);
        },
        removeItem: (name: string) => {
          console.log('[NASGE Persist] removeItem', { name });
          localStorage.removeItem(name);
        }
      },
      // 关键修复：使用自定义 merge 策略，确保持久化数据完全覆盖初始状态
      merge: (persistedState: any, currentState: GuideState) => {
        console.log('[NASGE Persist] merge 调用', {
          persistedStateKeys: Object.keys(persistedState || {}),
          persistedDraftsCount: persistedState?.drafts?.length,
          currentDraftsCount: currentState.drafts?.length,
          persistedPreview: persistedState ? JSON.stringify(persistedState).substring(0, 200) : 'null'
        });

        // Zustand persist 会自动从 { state: {...}, version } 中提取 state
        // 所以这里收到的 persistedState 就是之前保存的 state 对象
        if (persistedState && persistedState.drafts && Array.isArray(persistedState.drafts)) {
          console.log('[NASGE Persist] merge 成功恢复草稿', {
            draftsCount: persistedState.drafts.length,
            draftTitles: persistedState.drafts.map((d: any) => d.title)
          });
          // 完全使用持久化状态，忽略初始状态
          return persistedState as GuideState;
        }

        console.warn('[NASGE Persist] merge 未找到草稿数据，使用初始状态');
        return currentState;
      },
      onRehydrateStorage: () => {
        console.log('[NASGE Persist] 开始 rehydration');
        return (state, error) => {
          if (error) {
            console.error('[NASGE Persist] rehydration 失败', error);
          } else {
            console.log('[NASGE Persist] rehydration 完成', {
              draftsCount: state?.drafts?.length,
              activeDraftId: state?.activeDraftId,
              mode: state?.mode
            });
          }
        };
      },
      migrate: (persistedState: any, version) => {
        console.log('[NASGE] 数据迁移开始', {
          version,
          hasPersistedState: !!persistedState,
          persistedDraftsCount: persistedState?.drafts?.length,
          persistedDraftTitles: persistedState?.drafts?.map((d: any) => d.title)
        });

        if (!persistedState) {
          console.log('[NASGE] 无持久化数据，创建默认草稿');
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
          console.log('[NASGE] v5 -> v6 迁移：分离 draftName 和 title', {
            draftsCount: persistedState.drafts?.length
          });

          // 确保 drafts 数组存在且有效
          if (!persistedState.drafts || !Array.isArray(persistedState.drafts)) {
            console.warn('[NASGE] 检测到无效的 drafts 数据，创建默认草稿');
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
            console.warn('[NASGE] drafts 为空数组，创建默认草稿');
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
          console.log('[NASGE] v6 -> v7 迁移：title 从 string 改为 JSONContent', {
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
              console.log(`[NASGE] 迁移草稿 ${index + 1} 标题: "${titleStr}"`);

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
          console.log('[NASGE] 执行 v1 -> v2 迁移：BBCode 转 HTML');
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
          console.log('[NASGE] 执行 v2 -> v3 迁移：HTML 转 JSONContent');
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
          console.log('[NASGE] 执行 v3 -> v4 迁移：chapters 改为 drafts');
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

          console.log('[NASGE] v3 -> v4 迁移完成', {
            draftsCount: persistedState.drafts.length,
            activeDraftId: persistedState.activeDraftId
          });
        }

        console.log('[NASGE] 数据迁移完成', persistedState);
        return persistedState;
      }
    }
  )
);

// 立即订阅 store 以触发持久化初始化
useGuideStore.subscribe((state) => {
  console.log('[NASGE] Store 状态更新', {
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
      console.log('[NASGE] LocalStorage 实际保存的数据', {
        version: parsed.version,
        draftsCount: parsed.state?.drafts?.length,
        draftTitles: parsed.state?.drafts?.map((d: any) => d.title)
      });
    }
  } catch (e) {
    console.error('[NASGE] 读取 localStorage 失败', e);
  }
});

// 触发一次获取以确保持久化初始化
setTimeout(() => {
  const state = useGuideStore.getState();
  console.log('[NASGE] Store 初始状态', {
    draftsCount: state.drafts.length,
    mode: state.mode,
    hasGuideInfo: !!state.guideInfo
  });

  // 手动触发一次状态更新以强制持久化
  if (state.drafts.length > 0 && !state.activeDraftId) {
    console.log('[NASGE] 设置默认激活草稿');
    useGuideStore.setState({ activeDraftId: state.drafts[0].id });
  }

  // 验证持久化
  setTimeout(() => {
    const persisted = localStorage.getItem('nasge-guide-drafts');
    console.log('[NASGE] 持久化验证', {
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
