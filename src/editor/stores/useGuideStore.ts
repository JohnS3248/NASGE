"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ChapterDraft = {
  id: string;
  title: string;
  bbcode: string;
  updatedAt: number;
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
          bbcode: "",
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
          bbcode: "",
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
      name: "nasge-guide-drafts"
    }
  )
);
