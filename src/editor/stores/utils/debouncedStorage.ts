/**
 * Debounced localStorage 持久化工具
 *
 * 供 zustand persist middleware 使用，合并高频 setItem 减少 localStorage 写放大
 * （草稿内容随 TipTap 更新每几十 ms 一次，若直接写 localStorage 会严重卡 IO）。
 *
 * 数据保护：
 * - 自动监听 `beforeunload`，关闭/刷新标签页时强制 flush 待写入数据
 * - 调用方可手动调用 `flush()` 强制立即持久化（用于切换 guide、退出草稿等场景）
 *
 * 注意：getItem/setItem 的形状匹配 zustand `PersistStorage`（已解析 JSON 对象），
 * 不是原生 localStorage 的字符串接口。
 */
import type { PersistStorage, StorageValue } from "zustand/middleware";
import { loggers } from "../../../shared/logger";

export interface DebouncedStorage<S> extends PersistStorage<S> {
  /** 立即写入所有待持久化数据（取消 debounce 定时器）*/
  flush: () => void;
}

/**
 * 创建一个基于 localStorage 的 debounced 持久化 storage。
 *
 * @param debounceMs 合并写入的延迟毫秒数，默认 500
 */
export function createDebouncedStorage<S>(debounceMs = 500): DebouncedStorage<S> {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingValue: { name: string; value: StorageValue<S> } | null = null;

  const writePending = (tag: 'debounced' | 'flushed') => {
    if (!pendingValue) return;
    const valueStr = JSON.stringify(pendingValue.value);
    loggers.persist.verbose(`setItem (${tag})`, { name: pendingValue.name });
    localStorage.setItem(pendingValue.name, valueStr);
    pendingValue = null;
  };

  const flush = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    writePending('flushed');
  };

  const storage: DebouncedStorage<S> = {
    getItem: (name) => {
      const str = localStorage.getItem(name);
      if (!str) return null;
      try {
        return JSON.parse(str) as StorageValue<S>;
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      pendingValue = { name, value };
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        writePending('debounced');
        debounceTimer = null;
      }, debounceMs);
    },
    removeItem: (name) => {
      localStorage.removeItem(name);
    },
    flush,
  };

  // beforeunload: 标签页关闭/刷新时强制 flush，防止丢 debounceMs 内的未持久化数据
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flush);
  }

  return storage;
}
