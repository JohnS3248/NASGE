/**
 * useWholeGuideSync — 全篇模式拉取 / 上传 hook
 *
 * 编排 useWholeGuideStore 的 state 变化 + 调用 chapterSync 服务。
 *
 * 复用现有服务：
 *   - fetchChapterList / fetchChapterFromSteam / saveChapterToSteam / createChapterOnSteam（chapterSync.ts）
 *   - fetchGuideInfo（guideInfo.ts）
 *   - useSteamGuideImageStore.refresh()（图片池预加载）
 *   - useArchiveStore.saveChaptersToArchive（章节列表同步）
 *
 * 关键设计：
 *   - 拉取：图片池先 await 完成才反序列化 BBCode（避免 [previewimg] 找不到 URL）
 *   - 上传：getSessionId 缓存一次，后续 saveChapterToSteam 全部传同一个 sessionId
 *   - dirty 检测：用 contentHash + title 双重比对决定章节是否需要上传
 *   - 上传后显式同步 useArchiveStore.chapters，避免远程章节列表与本地存档不一致
 *   - sanitizeText（去 NUL 字节）在切片器入口已实施，本 hook 不重复
 */

import { useMemo } from "react";
import i18n from "i18next";
import {
  fetchChapterList,
  fetchChapterFromSteam,
  saveChapterToSteam,
  createChapterOnSteam,
  getSessionId,
} from "../services/chapterSync";
import { fetchGuideInfo } from "../services/guideInfo";
import { useWholeGuideStore } from "../stores/useWholeGuideStore";
import { useSteamGuideImageStore } from "../stores/useSteamGuideImageStore";
import { useArchiveStore } from "../stores/useArchiveStore";
import {
  sliceDocByChapterTitle,
  buildDocFromChapters,
  sanitizeText,
  type ChapterSlice,
} from "../utils/wholeGuideSlice";
import { toast } from "../stores/useToastStore";
import { loggers } from "../../shared/logger";

// =============================================================================
// 类型
// =============================================================================

export interface PullProgress {
  phase: "images" | "list" | "chapters" | "building";
  loaded: number;
  total: number;
}

export interface PushProgress {
  phase: "session" | "slicing" | "uploading" | "archive" | "snapshot";
  current?: { sectionId: string; title: string };
  loaded: number;
  total: number;
}

export interface PushOptions {
  onProgress?: (p: PushProgress) => void;
  /** 仅切片不上传（审阅页 diff 计算专用） */
  dryRun?: boolean;
}

export interface PushResult {
  uploadedSectionIds: string[];
  failedSectionIds: string[];
  /** dryRun=true 时返回切片结果供调用方做 diff */
  slices?: ChapterSlice[];
}

// =============================================================================
// pullEntireGuide
// =============================================================================

export async function pullEntireGuide(
  guideId: string,
  onProgress?: (p: PullProgress) => void
): Promise<void> {
  const store = useWholeGuideStore;
  store.getState().setStatus("pulling");
  store.getState().setError(null);

  try {
    // ───── 图片池预加载（先 await 完成，BBCode 反序列化时才能查到 [previewimg] URL）─────
    onProgress?.({ phase: "images", loaded: 0, total: 1 });
    try {
      await useSteamGuideImageStore.getState().refresh();
    } catch (err) {
      // 图片池失败不阻断 pull，BBCode 中的图片 URL 仍可显示（虽无透明背景）
      loggers.sync.warn("图片池刷新失败，继续拉取章节", err);
    }
    onProgress?.({ phase: "images", loaded: 1, total: 1 });

    // ───── 拉取指南元信息 + 章节列表 ─────
    onProgress?.({ phase: "list", loaded: 0, total: 1 });

    let guideTitle = "";
    try {
      const info = await fetchGuideInfo(guideId);
      guideTitle = info.title ?? "";
    } catch (err) {
      // guideInfo 失败不阻断 pull（标题可后续从 chapterList 推断）
      loggers.sync.warn("fetchGuideInfo 失败，继续 fetchChapterList", err);
    }

    const chapterList = await fetchChapterList(guideId);
    if (chapterList.length === 0) {
      throw new Error(
        i18n.t("wholeGuide.error.emptyGuide", {
          ns: "editor",
          defaultValue: "指南没有任何章节，无法进入全篇模式。",
        })
      );
    }
    onProgress?.({ phase: "list", loaded: 1, total: 1 });

    // ───── 并行拉取所有章节内容 ─────
    const total = chapterList.length;
    let loaded = 0;
    onProgress?.({ phase: "chapters", loaded, total });

    const chapterContents = await Promise.all(
      chapterList.map(async (c) => {
        const content = await fetchChapterFromSteam(guideId, c.sectionId);
        loaded++;
        onProgress?.({ phase: "chapters", loaded, total });
        return content;
      })
    );

    // ───── 构造单 doc ─────
    onProgress?.({ phase: "building", loaded: 0, total: 1 });

    const doc = buildDocFromChapters(
      chapterList.map((c, i) => ({
        sectionId: c.sectionId,
        title: c.title,
        bbcode: chapterContents[i].description,
      }))
    );

    const chapterMeta = chapterList.map((c, i) => ({
      sectionId: c.sectionId,
      title: sanitizeText(c.title),
      bbcode: sanitizeText(chapterContents[i].description),
      contentHash: simpleHash(sanitizeText(chapterContents[i].description)),
      order: c.order,
    }));

    onProgress?.({ phase: "building", loaded: 1, total: 1 });

    // ───── 写入 store ─────
    const s = store.getState();
    s.setGuideId(guideId);
    s.setGuideTitle(guideTitle);
    s.setDoc(doc);
    s.setChapters(chapterMeta);
    s.clearChapterDirty();
    s.setLastPulledAt(Date.now());
    s.setStatus("editing");

    loggers.sync.info("pullEntireGuide 完成", {
      guideId,
      chapterCount: chapterList.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    store.getState().setStatus("idle");
    store.getState().setError(msg);
    toast.error(
      i18n.t("wholeGuide.pullFailed", {
        ns: "editor",
        err: msg,
        defaultValue: `拉取失败：${msg}`,
      })
    );
    loggers.sync.error("pullEntireGuide 失败", err);
    throw err;
  }
}

// =============================================================================
// pushEntireGuide
// =============================================================================

export async function pushEntireGuide(
  options: PushOptions = {}
): Promise<PushResult> {
  const store = useWholeGuideStore;
  const { onProgress, dryRun = false } = options;
  const result: PushResult = {
    uploadedSectionIds: [],
    failedSectionIds: [],
  };

  const state = store.getState();
  if (!state.doc || !state.guideId) {
    throw new Error("No guide loaded");
  }

  store.getState().setStatus("pushing");
  store.getState().setError(null);

  try {
    // ───── 缓存 sessionId（避免逐章重复 getSessionId）─────
    onProgress?.({ phase: "session", loaded: 0, total: 1 });
    const sessionId = dryRun ? "" : await getSessionId();
    onProgress?.({ phase: "session", loaded: 1, total: 1 });

    // ───── 切片当前 doc ─────
    onProgress?.({ phase: "slicing", loaded: 0, total: 1 });
    const sliceResult = sliceDocByChapterTitle(
      state.doc,
      state.chapters.map((c) => ({ sectionId: c.sectionId, title: c.title }))
    );

    const overflowing = sliceResult.warnings.filter(
      (w) => w.type === "body-overflow"
    );
    if (overflowing.length > 0) {
      throw new Error(
        i18n.t("wholeGuide.error.bodyOverflow", {
          ns: "editor",
          chapters: overflowing.map((w) => w.detail).join("; "),
          defaultValue: `以下章节正文超过 8000 字符上限：${overflowing
            .map((w) => w.detail)
            .join("; ")}`,
        })
      );
    }
    onProgress?.({ phase: "slicing", loaded: 1, total: 1 });

    if (dryRun) {
      store.getState().setStatus("editing");
      return { ...result, slices: sliceResult.chapters };
    }

    // ───── 找出 dirty 章节并串行上传 ─────
    const dirtySlices = sliceResult.chapters.filter((slice) => {
      const old = state.chapters.find((c) => c.sectionId === slice.sectionId);
      if (!old) return true; // 新增章节
      return slice.contentHash !== old.contentHash || slice.title !== old.title;
    });

    const total = dirtySlices.length;
    let loaded = 0;

    for (const slice of dirtySlices) {
      onProgress?.({
        phase: "uploading",
        current: {
          sectionId: slice.sectionId ?? "<new>",
          title: slice.title,
        },
        loaded,
        total,
      });

      try {
        let finalSectionId = slice.sectionId;
        if (!finalSectionId) {
          // 新章节：创建后写回 sectionId
          finalSectionId = await createChapterOnSteam(state.guideId);
        }
        await saveChapterToSteam(
          state.guideId,
          finalSectionId,
          slice.title,
          slice.bbcode,
          sessionId // 复用缓存
        );
        slice.sectionId = finalSectionId;
        result.uploadedSectionIds.push(finalSectionId);
        loaded++;
      } catch (err) {
        loggers.sync.error("saveChapterToSteam 单章失败，继续下一章", {
          slice,
          err,
        });
        result.failedSectionIds.push(
          slice.sectionId ?? `<new-${slice.title}>`
        );
      }
    }

    if (result.failedSectionIds.length > 0) {
      toast.warning(
        i18n.t("wholeGuide.partialFail", {
          ns: "editor",
          failed: result.failedSectionIds.length,
          total: total,
          defaultValue: `部分失败：${result.failedSectionIds.length}/${total} 章未上传成功`,
        })
      );
    }

    // ───── 同步 useArchiveStore.chapters（保持远程章节列表与本地存档一致）─────
    onProgress?.({ phase: "archive", loaded: 0, total: 1 });
    const archiveChapters = sliceResult.chapters
      .filter((s) => !!s.sectionId)
      .map((s, i) => ({
        sectionId: s.sectionId as string,
        title: s.title,
        order: i,
      }));
    if (archiveChapters.length > 0) {
      useArchiveStore
        .getState()
        .saveChaptersToArchive(state.guideId, archiveChapters);
    }
    onProgress?.({ phase: "archive", loaded: 1, total: 1 });

    // ───── 更新 store baseline（contentHash + bbcode）─────
    onProgress?.({ phase: "snapshot", loaded: 0, total: 1 });
    const newChapters = sliceResult.chapters
      .filter((s) => !!s.sectionId)
      .map((s, i) => ({
        sectionId: s.sectionId as string,
        title: s.title,
        bbcode: s.bbcode,
        contentHash: s.contentHash,
        order: i,
      }));
    store.getState().setChapters(newChapters);
    store.getState().setLastPushedAt(Date.now());
    store.getState().clearChapterDirty();
    store.getState().setStatus("editing");
    onProgress?.({ phase: "snapshot", loaded: 1, total: 1 });

    loggers.sync.info("pushEntireGuide 完成", {
      uploaded: result.uploadedSectionIds.length,
      failed: result.failedSectionIds.length,
    });
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    store.getState().setStatus("editing");
    store.getState().setError(msg);
    toast.error(
      i18n.t("wholeGuide.pushFailed", {
        ns: "editor",
        err: msg,
        defaultValue: `上传失败：${msg}`,
      })
    );
    loggers.sync.error("pushEntireGuide 失败", err);
    throw err;
  }
}

// =============================================================================
// 内部 hash 函数（与 wholeGuideSlice.syncHash 保持一致）
// =============================================================================

function simpleHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// =============================================================================
// React hook 包装（稳定引用，方便组件使用）
// =============================================================================

export function useWholeGuideSync() {
  return useMemo(
    () => ({
      pullEntireGuide,
      pushEntireGuide,
    }),
    []
  );
}
