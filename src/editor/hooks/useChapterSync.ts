import { useState, useCallback } from 'react';
import { useGuideStore } from '../stores/useGuideStore';
import { fetchChapterFromSteam, saveChapterToSteam, reorderChaptersOnSteam } from '../services/chapterSync';
import { bbcodeToHtml, htmlToBBCode } from '../utils/bbcode';
import { generateJSON, generateHTML } from '@tiptap/html';
import { createEditorExtensions } from '../utils/editorExtensions';

export type ChapterSyncStatus = 'idle' | 'loading' | 'success' | 'error';

export function useChapterSync() {
  const { guideInfo, drafts, addDraft, updateDraft, selectDraft } = useGuideStore();
  const [syncStatus, setSyncStatus] = useState<Record<string, ChapterSyncStatus>>({});
  const [syncError, setSyncError] = useState<Record<string, string>>({});

  /**
   * 拉取章节内容到草稿
   * - 如果已有关联的草稿，更新该草稿
   * - 如果没有关联的草稿，创建新草稿
   */
  const pullChapter = useCallback(
    async (sectionId: string) => {
      if (!guideInfo) {
        console.error('[NASGE] 无法拉取章节：未加载指南信息');
        return;
      }

      setSyncStatus((prev) => ({ ...prev, [sectionId]: 'loading' }));
      setSyncError((prev) => ({ ...prev, [sectionId]: '' }));

      try {
        // 1. 从 Steam 拉取章节内容
        console.log('[NASGE] 拉取章节', { guideId: guideInfo.id, sectionId });
        const chapterContent = await fetchChapterFromSteam(guideInfo.id, sectionId);

        // 2. 将 BBCode 转换为 JSON
        const html = bbcodeToHtml(chapterContent.description);
        const extensions = createEditorExtensions();
        const contentJson = generateJSON(html, extensions);

        // 3. 查找是否已有关联的草稿
        const existingDraft = drafts.find((d) => d.linkedChapterId === sectionId);

        if (existingDraft) {
          // 更新现有草稿
          console.log('[NASGE] 更新现有草稿', { draftId: existingDraft.id, sectionId });
          updateDraft(existingDraft.id, {
            title: chapterContent.title,
            content: contentJson,
            lastSyncedAt: Date.now()
          });
          selectDraft(existingDraft.id);
        } else {
          // 创建新草稿
          console.log('[NASGE] 创建新草稿', { sectionId });
          const newDraft = addDraft(chapterContent.title);
          updateDraft(newDraft.id, {
            content: contentJson,
            linkedChapterId: sectionId,
            linkedGuideId: guideInfo.id,
            lastSyncedAt: Date.now()
          });
          selectDraft(newDraft.id);
        }

        setSyncStatus((prev) => ({ ...prev, [sectionId]: 'success' }));
        console.log('[NASGE] 章节拉取成功', { sectionId });
      } catch (error) {
        console.error('[NASGE] 章节拉取失败', error);
        const errorMsg = error instanceof Error ? error.message : '拉取失败';
        setSyncError((prev) => ({ ...prev, [sectionId]: errorMsg }));
        setSyncStatus((prev) => ({ ...prev, [sectionId]: 'error' }));
      }
    },
    [guideInfo, drafts, addDraft, updateDraft, selectDraft]
  );

  /**
   * 切换到章节对应的草稿
   * - 如果已有关联的草稿，直接切换
   * - 如果没有，提示拉取
   */
  const switchToChapter = useCallback(
    (sectionId: string) => {
      const linkedDraft = drafts.find((d) => d.linkedChapterId === sectionId);
      if (linkedDraft) {
        selectDraft(linkedDraft.id);
        return true;
      }
      return false;
    },
    [drafts, selectDraft]
  );

  /**
   * 获取章节对应的草稿
   */
  const getChapterDraft = useCallback(
    (sectionId: string) => {
      return drafts.find((d) => d.linkedChapterId === sectionId);
    },
    [drafts]
  );

  /**
   * 上传草稿到 Steam
   * - 将当前草稿内容转换为 BBCode
   * - 上传到关联的章节
   * - 更新 lastSyncedAt
   */
  const pushDraft = useCallback(
    async (draftId: string) => {
      const draft = drafts.find((d) => d.id === draftId);
      if (!draft) {
        throw new Error('草稿不存在');
      }

      if (!draft.linkedChapterId || !draft.linkedGuideId) {
        throw new Error('该草稿未关联章节，无法上传');
      }

      const sectionId = draft.linkedChapterId;
      setSyncStatus((prev) => ({ ...prev, [sectionId]: 'loading' }));
      setSyncError((prev) => ({ ...prev, [sectionId]: '' }));

      try {
        // 1. 将 JSON 内容转换为 HTML
        console.log('[NASGE] 上传草稿到 Steam', { draftId, sectionId });
        const extensions = createEditorExtensions();
        const html = generateHTML(draft.content, extensions);

        // 2. 将 HTML 转换为 BBCode
        const bbcode = htmlToBBCode(html);

        // 3. 上传到 Steam
        await saveChapterToSteam(
          draft.linkedGuideId,
          draft.linkedChapterId,
          draft.title,
          bbcode
        );

        // 4. 更新草稿的同步时间
        updateDraft(draftId, {
          lastSyncedAt: Date.now()
        });

        setSyncStatus((prev) => ({ ...prev, [sectionId]: 'success' }));
        console.log('[NASGE] 草稿上传成功', { draftId, sectionId });
      } catch (error) {
        console.error('[NASGE] 草稿上传失败', error);
        const errorMsg = error instanceof Error ? error.message : '上传失败';
        setSyncError((prev) => ({ ...prev, [sectionId]: errorMsg }));
        setSyncStatus((prev) => ({ ...prev, [sectionId]: 'error' }));
        throw error;
      }
    },
    [drafts, updateDraft]
  );

  /**
   * 同步章节排序到 Steam
   */
  const syncChapterOrder = useCallback(
    async (orderedSectionIds: string[]) => {
      if (!guideInfo) {
        throw new Error('未加载指南信息');
      }

      console.log('[NASGE] 同步章节排序到 Steam', { orderedSectionIds });

      try {
        await reorderChaptersOnSteam(guideInfo.id, orderedSectionIds);
        console.log('[NASGE] 章节排序同步成功');
      } catch (error) {
        console.error('[NASGE] 章节排序同步失败', error);
        throw error;
      }
    },
    [guideInfo]
  );

  return {
    pullChapter,
    pushDraft,
    switchToChapter,
    getChapterDraft,
    syncChapterOrder,
    syncStatus,
    syncError
  };
}
