/**
 * wholeBackupService — 全篇模式手动 archive（IndexedDB）
 *
 * 用 idb library 操作 nasge-whole-backup 数据库；每条记录含完整 doc + chapters + 元信息。
 * 单条记录可较大（章节多时 200KB+），所以 list() 仅返回元数据，loadFull() 才取 doc。
 */

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { JSONContent } from "@tiptap/core";
import type { WholeGuideChapterMeta } from "../stores/useWholeGuideStore";
import { loggers } from "../../shared/logger";

const DB_NAME = "nasge-whole-backup";
const DB_VERSION = 1;
const STORE_NAME = "archives";

interface NasgeWholeBackupDB extends DBSchema {
  archives: {
    key: string;
    value: WholeArchiveRecord;
    indexes: {
      "by-guide": string;
      "by-created": number;
    };
  };
}

export interface WholeArchiveRecord {
  archiveId: string;
  guideId: string;
  label: string;
  createdAt: number;
  doc: JSONContent;
  chapters: WholeGuideChapterMeta[];
  sizeBytes: number;
}

export interface ArchiveSummary {
  archiveId: string;
  guideId: string;
  label: string;
  createdAt: number;
  chapterCount: number;
  sizeBytes: number;
}

export interface QuotaInfo {
  usageBytes: number;
  quotaBytes: number;
  ratio: number;
}

let dbPromise: Promise<IDBPDatabase<NasgeWholeBackupDB>> | null = null;

function getDB(): Promise<IDBPDatabase<NasgeWholeBackupDB>> {
  if (!dbPromise) {
    dbPromise = openDB<NasgeWholeBackupDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: "archiveId",
          });
          store.createIndex("by-guide", "guideId");
          store.createIndex("by-created", "createdAt");
        }
      },
    });
  }
  return dbPromise;
}

function uuid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function summarize(record: WholeArchiveRecord): ArchiveSummary {
  return {
    archiveId: record.archiveId,
    guideId: record.guideId,
    label: record.label,
    createdAt: record.createdAt,
    chapterCount: record.chapters.length,
    sizeBytes: record.sizeBytes,
  };
}

/**
 * 创建一份手动存档。
 * @returns archiveId（用于后续 restore/rename/delete）
 */
export async function saveManualArchive(input: {
  guideId: string;
  label: string;
  doc: JSONContent;
  chapters: WholeGuideChapterMeta[];
}): Promise<string> {
  const archiveId = uuid();
  const docJson = JSON.stringify(input.doc);
  const record: WholeArchiveRecord = {
    archiveId,
    guideId: input.guideId,
    label: input.label,
    createdAt: Date.now(),
    doc: input.doc,
    chapters: input.chapters,
    sizeBytes: docJson.length,
  };
  const db = await getDB();
  await db.put(STORE_NAME, record);
  loggers.store.info("manual archive saved", {
    archiveId,
    guideId: input.guideId,
    label: input.label,
    sizeBytes: record.sizeBytes,
  });
  return archiveId;
}

/** 列出指定 guide 的所有存档（元数据，不含 doc），按创建时间倒序 */
export async function listArchives(guideId: string): Promise<ArchiveSummary[]> {
  const db = await getDB();
  const records = await db.getAllFromIndex(STORE_NAME, "by-guide", guideId);
  return records
    .map(summarize)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** 取完整存档（含 doc / chapters） */
export async function loadFullArchive(
  archiveId: string
): Promise<WholeArchiveRecord> {
  const db = await getDB();
  const record = await db.get(STORE_NAME, archiveId);
  if (!record) {
    throw new Error(`archive not found: ${archiveId}`);
  }
  return record;
}

export async function deleteArchive(archiveId: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, archiveId);
  loggers.store.info("manual archive deleted", { archiveId });
}

export async function renameArchive(
  archiveId: string,
  newLabel: string
): Promise<void> {
  const db = await getDB();
  const record = await db.get(STORE_NAME, archiveId);
  if (!record) {
    throw new Error(`archive not found: ${archiveId}`);
  }
  record.label = newLabel;
  await db.put(STORE_NAME, record);
  loggers.store.info("manual archive renamed", { archiveId, newLabel });
}

/** 查询本机当前 IndexedDB 配额 */
export async function getQuota(): Promise<QuotaInfo | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return null;
  }
  const est = await navigator.storage.estimate();
  const usageBytes = est.usage ?? 0;
  const quotaBytes = est.quota ?? 1;
  return {
    usageBytes,
    quotaBytes,
    ratio: usageBytes / quotaBytes,
  };
}
