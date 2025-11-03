"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { bbcodeToHtml } from "../utils/bbcode";
import { JSONContent } from "@tiptap/core";
import { createEditorExtensions, createEmptyDoc } from "../utils/editorExtensions";
import { generateJSON } from "@tiptap/html";

export type ChapterDraft = {
  id: string;
  title: string;
  content: JSONContent;
  updatedAt: number;
  steamSectionId?: string;
  steamGuideId?: string;
  lastSyncedAt?: number;
};

type GuideState = {
  chapters: ChapterDraft[];
  activeId: string | null;
  selectChapter: (id: string) => void;
  addChapter: () => ChapterDraft;
  updateChapter: (id: string, patch: Partial<ChapterDraft>) => void;
  deleteChapter: (id: string) => void;
  restoreChapter: () => void;
};

let deletedCache: ChapterDraft | null = null;

export const useGuideStore = create<GuideState>()(
  persist(
    (set, get) => ({
      chapters: [
        {
          id: crypto.randomUUID(),
          title: "章节 1",
          content: createEmptyDoc(),
          updatedAt: Date.now()
        }
      ],
      activeId: null,
      selectChapter: (id) => {
        set({
          activeId: id
        });
      },
      addChapter: () => {
        const chapter: ChapterDraft = {
          id: crypto.randomUUID(),
          title: `章节 ${get().chapters.length + 1}`,
          content: createEmptyDoc(),
          updatedAt: Date.now()
        };
        set((state) => ({
          chapters: [...state.chapters, chapter],
          activeId: chapter.id
        }));
        return chapter;
      },
      updateChapter: (id, patch) => {
        set((state) => ({
          chapters: state.chapters.map((chapter) =>
            chapter.id === id
              ? {
                  ...chapter,
                  ...patch,
                  updatedAt: Date.now()
                }
              : chapter
          )
        }));
      },
      deleteChapter: (id) => {
        set((state) => {
          const remaining = state.chapters.filter((chapter) => chapter.id !== id);
          const removed = state.chapters.find((chapter) => chapter.id === id) ?? null;
          deletedCache = removed;
          return {
            chapters: remaining.length ? remaining : state.chapters,
            activeId:
              state.activeId === id
                ? remaining.length
                  ? remaining[remaining.length - 1].id
                  : state.chapters[0]?.id ?? null
                : state.activeId
          };
        });
      },
      restoreChapter: () => {
        if (!deletedCache) return;
        const chapter = deletedCache;
        deletedCache = null;
        set((state) => ({
          chapters: [...state.chapters, chapter],
          activeId: chapter.id
        }));
      }
    }),
    {
      name: "nasge-guide-drafts",
      version: 3,
      migrate: (persistedState: any, version) => {
        if (!persistedState) {
          return persistedState;
        }

        const extensions = createEditorExtensions();

        if (version < 2 && persistedState.chapters) {
          persistedState.chapters = persistedState.chapters.map((chapter: any) => {
            const bbcode = typeof chapter.bbcode === "string" ? chapter.bbcode : "";
            const html = bbcode ? bbcodeToHtml(bbcode) : "";
            return {
              ...chapter,
              content: toJSONContent(html, extensions)
            };
          });
        }

        if (version < 3 && persistedState.chapters) {
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

        return persistedState;
      }
    }
  )
);

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
