/**
 * 图片悬浮窗状态管理
 * 管理悬浮窗的窗口状态、显示设置、选中状态等
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { loggers } from "../../shared/logger";

// ============ 类型定义 ============

/** 缩略图尺寸预设 */
export type ThumbnailSizePreset = "small" | "medium" | "large" | "custom";

/** 缩略图尺寸映射 */
export const THUMBNAIL_SIZE_MAP: Record<Exclude<ThumbnailSizePreset, "custom">, number> = {
  small: 64,
  medium: 96,
  large: 128
};

/** 排序字段 */
export type SortBy = "uploadTime" | "fileName";

/** 排序方向 */
export type SortOrder = "asc" | "desc";

/** 筛选状态 */
export type FilterStatus = "all" | "pending" | "uploading" | "success" | "error";

/** 图片来源 Tab */
export type ImageSourceTab = "pool" | "screenshots";

/** 窗口位置 */
export interface PanelPosition {
  x: number;
  y: number;
}

/** 窗口尺寸 */
export interface PanelSize {
  width: number;
  height: number;
}

/** 悬浮窗显示设置（持久化） */
export interface ImagePanelSettings {
  // 缩略图设置
  thumbnailSizePreset: ThumbnailSizePreset;
  customThumbnailSize: number; // 自定义尺寸 (32-256)

  // 分页设置
  itemsPerPage: number; // 4, 8, 12, 16, 0=全部

  // 显示选项
  showFileName: boolean;
  showStatusIndicator: boolean;

  // 窗口行为
  autoOpenOnStart: boolean;
  rememberPosition: boolean;

  // 插入设置
  defaultInsertSize: "original" | "medium" | "small";
  defaultInsertAlignment: "floatLeft" | "floatRight" | "center" | "inline";
  doubleClickToInsert: boolean;
  afterInsertAction: "none" | "close" | "minimize";
}

/** 悬浮窗运行时状态（不持久化） */
export interface ImagePanelRuntimeState {
  // 窗口状态
  isOpen: boolean;
  isMinimized: boolean;
  isCollapsed: boolean;

  // 窗口位置和尺寸
  position: PanelPosition;
  size: PanelSize;

  // 分页
  currentPage: number;

  // 筛选/排序
  sortBy: SortBy;
  sortOrder: SortOrder;
  filterStatus: FilterStatus;
  searchQuery: string;

  // 选中状态
  selectedIds: string[];
  focusedId: string | null;
  lastSelectedId: string | null; // 用于 Shift 范围选择

  // 编辑状态
  editingImageId: string | null; // 正在编辑文件名的图片 ID

  // 来源 Tab
  sourceTab: ImageSourceTab;
}

/** Store 完整状态 */
export interface ImagePanelState extends ImagePanelSettings, ImagePanelRuntimeState {
  // ============ 窗口控制 Actions ============
  open: () => void;
  close: () => void;
  toggle: () => void;
  minimize: () => void;
  restore: () => void;
  collapse: () => void;
  expand: () => void;

  // ============ 位置/尺寸 Actions ============
  setPosition: (position: PanelPosition) => void;
  setSize: (size: PanelSize) => void;
  resetPosition: () => void;

  // ============ 显示设置 Actions ============
  setThumbnailSize: (preset: ThumbnailSizePreset, customSize?: number) => void;
  setItemsPerPage: (count: number) => void;
  setShowFileName: (show: boolean) => void;
  setShowStatusIndicator: (show: boolean) => void;

  // ============ 分页 Actions ============
  setCurrentPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  goToFirstPage: () => void;
  goToLastPage: (totalPages: number) => void;

  // ============ 筛选/排序 Actions ============
  setSortBy: (sortBy: SortBy) => void;
  setSortOrder: (order: SortOrder) => void;
  toggleSortOrder: () => void;
  setFilterStatus: (status: FilterStatus) => void;
  setSearchQuery: (query: string) => void;
  clearFilters: () => void;

  // ============ 选择 Actions ============
  selectImage: (id: string, mode: "single" | "toggle" | "add") => void;
  selectRange: (id: string, allIds: string[]) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  setFocus: (id: string | null) => void;

  // ============ 编辑 Actions ============
  setEditingImageId: (id: string | null) => void;

  // ============ 插入设置 Actions ============
  setDefaultInsertSize: (size: "original" | "medium" | "small") => void;
  setDefaultInsertAlignment: (alignment: "floatLeft" | "floatRight" | "center" | "inline") => void;
  setDoubleClickToInsert: (enabled: boolean) => void;
  setAfterInsertAction: (action: "none" | "close" | "minimize") => void;

  // ============ Tab 切换 ============
  setSourceTab: (tab: ImageSourceTab) => void;

  // ============ 工具方法 ============
  getThumbnailSizePixels: () => number;
  getImagesPerRow: () => number;
  resetSettings: () => void;
}

// ============ 默认值 ============

const DEFAULT_SETTINGS: ImagePanelSettings = {
  thumbnailSizePreset: "medium",
  customThumbnailSize: 96,
  itemsPerPage: 8,
  showFileName: true,
  showStatusIndicator: true,
  autoOpenOnStart: false, // 默认不自动打开，显示为左下角按钮
  rememberPosition: true,
  defaultInsertSize: "original",
  defaultInsertAlignment: "inline",
  doubleClickToInsert: true,
  afterInsertAction: "none"
};

const DEFAULT_POSITION: PanelPosition = { x: 100, y: 100 };
const DEFAULT_SIZE: PanelSize = { width: 400, height: 450 };
const MIN_SIZE: PanelSize = { width: 200, height: 150 };
const PADDING = 16; // 内边距
const GAP = 8; // 图片间距

const DEFAULT_RUNTIME_STATE: ImagePanelRuntimeState = {
  isOpen: false,
  isMinimized: false,
  isCollapsed: false,
  position: DEFAULT_POSITION,
  size: DEFAULT_SIZE,
  currentPage: 1,
  sortBy: "uploadTime",
  sortOrder: "desc",
  filterStatus: "all",
  searchQuery: "",
  selectedIds: [],
  focusedId: null,
  lastSelectedId: null,
  editingImageId: null,
  sourceTab: "pool"
};

/**
 * 确保位置在视口内，超出则重置到左上角
 * 解决半屏时图片池超出视口不可见的问题
 */
function ensureInViewport(position: PanelPosition, size: PanelSize): PanelPosition {
  // 在 SSR 环境或 store 初始化时 window 可能不存在
  if (typeof window === "undefined") return position;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const margin = 16; // 边距

  const { x, y } = position;

  // 检查是否超出视口（至少要显示 100px 宽度和标题栏）
  const isOutOfBounds =
    x + 100 > viewportWidth ||
    y + 50 > viewportHeight ||
    x < 0 ||
    y < 0;

  // 超出视口则重置到左上角
  if (isOutOfBounds) {
    return { x: margin, y: 80 }; // 80px 避开顶部工具栏
  }

  return position;
}

// ============ Store 创建 ============

export const useImagePanelStore = create<ImagePanelState>()(
  persist(
    (set, get) => ({
      // 合并默认值
      ...DEFAULT_SETTINGS,
      ...DEFAULT_RUNTIME_STATE,

      // ============ 窗口控制 Actions ============
      open: () => {
        loggers.image.verbose("打开图片悬浮窗");
        const { position, size } = get();
        // 检查位置是否在视口内，超出则调整
        const adjustedPosition = ensureInViewport(position, size);
        set({ isOpen: true, isMinimized: false, position: adjustedPosition });
      },

      close: () => {
        loggers.image.verbose("关闭图片悬浮窗");
        set({ isOpen: false });
      },

      toggle: () => {
        const { isOpen } = get();
        if (isOpen) {
          get().close();
        } else {
          get().open();
        }
      },

      minimize: () => {
        loggers.image.verbose("最小化图片悬浮窗");
        set({ isMinimized: true });
      },

      restore: () => {
        loggers.image.verbose("恢复图片悬浮窗");
        const { position, size } = get();
        // 检查位置是否在视口内，超出则调整
        const adjustedPosition = ensureInViewport(position, size);
        set({ isMinimized: false, isCollapsed: false, position: adjustedPosition });
      },

      collapse: () => {
        loggers.image.verbose("折叠图片悬浮窗");
        set({ isCollapsed: true });
      },

      expand: () => {
        loggers.image.verbose("展开图片悬浮窗");
        set({ isCollapsed: false });
      },

      // ============ 位置/尺寸 Actions ============
      setPosition: (position) => {
        set({ position });
      },

      setSize: (size) => {
        // 确保不小于最小尺寸
        const clampedSize: PanelSize = {
          width: Math.max(size.width, MIN_SIZE.width),
          height: Math.max(size.height, MIN_SIZE.height)
        };
        set({ size: clampedSize });
      },

      resetPosition: () => {
        loggers.image.info("重置悬浮窗位置");
        set({ position: DEFAULT_POSITION, size: DEFAULT_SIZE });
      },

      // ============ 显示设置 Actions ============
      setThumbnailSize: (preset, customSize) => {
        loggers.image.verbose("设置缩略图尺寸", { preset, customSize });
        const update: Partial<ImagePanelSettings> = { thumbnailSizePreset: preset };
        if (preset === "custom" && customSize !== undefined) {
          // 限制自定义尺寸范围
          update.customThumbnailSize = Math.min(256, Math.max(32, customSize));
        }
        set(update);
      },

      setItemsPerPage: (count) => {
        loggers.image.verbose("设置每页数量", count);
        set({ itemsPerPage: count, currentPage: 1 });
      },

      setShowFileName: (show) => {
        set({ showFileName: show });
      },

      setShowStatusIndicator: (show) => {
        set({ showStatusIndicator: show });
      },

      // ============ 分页 Actions ============
      setCurrentPage: (page) => {
        set({ currentPage: Math.max(1, page) });
      },

      nextPage: () => {
        set((state) => ({ currentPage: state.currentPage + 1 }));
      },

      prevPage: () => {
        set((state) => ({ currentPage: Math.max(1, state.currentPage - 1) }));
      },

      goToFirstPage: () => {
        set({ currentPage: 1 });
      },

      goToLastPage: (totalPages) => {
        set({ currentPage: Math.max(1, totalPages) });
      },

      // ============ 筛选/排序 Actions ============
      setSortBy: (sortBy) => {
        loggers.image.verbose("设置排序字段", sortBy);
        set({ sortBy, currentPage: 1 });
      },

      setSortOrder: (order) => {
        set({ sortOrder: order });
      },

      toggleSortOrder: () => {
        set((state) => ({ sortOrder: state.sortOrder === "asc" ? "desc" : "asc" }));
      },

      setFilterStatus: (status) => {
        loggers.image.verbose("设置筛选状态", status);
        set({ filterStatus: status, currentPage: 1 });
      },

      setSearchQuery: (query) => {
        set({ searchQuery: query, currentPage: 1 });
      },

      clearFilters: () => {
        loggers.image.verbose("清除筛选条件");
        set({
          filterStatus: "all",
          searchQuery: "",
          sortBy: "uploadTime",
          sortOrder: "desc",
          currentPage: 1
        });
      },

      // ============ 选择 Actions ============
      selectImage: (id, mode) => {
        set((state) => {
          let newSelectedIds: string[];

          switch (mode) {
            case "single":
              // 单选：清除其他选中，只选中当前
              newSelectedIds = [id];
              break;
            case "toggle":
              // 切换：如果已选中则取消，否则添加（Ctrl+点击）
              if (state.selectedIds.includes(id)) {
                newSelectedIds = state.selectedIds.filter((i) => i !== id);
              } else {
                newSelectedIds = [...state.selectedIds, id];
              }
              break;
            case "add":
              // 添加：添加到选中列表（不取消）
              if (!state.selectedIds.includes(id)) {
                newSelectedIds = [...state.selectedIds, id];
              } else {
                newSelectedIds = state.selectedIds;
              }
              break;
            default:
              newSelectedIds = state.selectedIds;
          }

          return {
            selectedIds: newSelectedIds,
            lastSelectedId: id,
            focusedId: id
          };
        });
      },

      selectRange: (id, allIds) => {
        // Shift+点击范围选择
        set((state) => {
          const lastId = state.lastSelectedId;
          if (!lastId) {
            return { selectedIds: [id], lastSelectedId: id, focusedId: id };
          }

          const startIndex = allIds.indexOf(lastId);
          const endIndex = allIds.indexOf(id);

          if (startIndex === -1 || endIndex === -1) {
            return { selectedIds: [id], lastSelectedId: id, focusedId: id };
          }

          const start = Math.min(startIndex, endIndex);
          const end = Math.max(startIndex, endIndex);
          const rangeIds = allIds.slice(start, end + 1);

          // 合并已选中的和范围内的
          const newSelectedIds = [...new Set([...state.selectedIds, ...rangeIds])];

          return {
            selectedIds: newSelectedIds,
            focusedId: id
            // 不更新 lastSelectedId，保持范围选择的起点
          };
        });
      },

      selectAll: (ids) => {
        loggers.image.verbose("全选图片", ids.length);
        set({
          selectedIds: ids,
          focusedId: ids[0] || null
        });
      },

      clearSelection: () => {
        set({ selectedIds: [], focusedId: null, lastSelectedId: null });
      },

      setFocus: (id) => {
        set({ focusedId: id });
      },

      // ============ 编辑 Actions ============
      setEditingImageId: (id) => {
        loggers.image.verbose("设置编辑中的图片", id);
        set({ editingImageId: id });
      },

      // ============ 插入设置 Actions ============
      setDefaultInsertSize: (size) => {
        loggers.image.verbose("设置默认插入尺寸", size);
        set({ defaultInsertSize: size });
      },

      setDefaultInsertAlignment: (alignment) => {
        loggers.image.verbose("设置默认插入对齐", alignment);
        set({ defaultInsertAlignment: alignment });
      },

      setDoubleClickToInsert: (enabled) => {
        set({ doubleClickToInsert: enabled });
      },

      setAfterInsertAction: (action) => {
        set({ afterInsertAction: action });
      },

      // ============ Tab 切换 ============
      setSourceTab: (tab) => {
        set({ sourceTab: tab, currentPage: 1, searchQuery: "" });
      },

      // ============ 工具方法 ============
      getThumbnailSizePixels: () => {
        const { thumbnailSizePreset, customThumbnailSize } = get();
        if (thumbnailSizePreset === "custom") {
          return customThumbnailSize;
        }
        return THUMBNAIL_SIZE_MAP[thumbnailSizePreset];
      },

      getImagesPerRow: () => {
        const { size } = get();
        const thumbnailSize = get().getThumbnailSizePixels();
        const availableWidth = size.width - PADDING * 2;
        return Math.max(1, Math.floor(availableWidth / (thumbnailSize + GAP)));
      },

      resetSettings: () => {
        loggers.image.info("重置悬浮窗设置");
        set({
          ...DEFAULT_SETTINGS,
          position: DEFAULT_POSITION,
          size: DEFAULT_SIZE
        });
      }
    }),
    {
      name: "nasge-image-panel",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // 只持久化设置和位置，不持久化运行时状态
      partialize: (state) => ({
        // 设置
        thumbnailSizePreset: state.thumbnailSizePreset,
        customThumbnailSize: state.customThumbnailSize,
        itemsPerPage: state.itemsPerPage,
        showFileName: state.showFileName,
        showStatusIndicator: state.showStatusIndicator,
        autoOpenOnStart: state.autoOpenOnStart,
        rememberPosition: state.rememberPosition,
        defaultInsertSize: state.defaultInsertSize,
        defaultInsertAlignment: state.defaultInsertAlignment,
        doubleClickToInsert: state.doubleClickToInsert,
        afterInsertAction: state.afterInsertAction,
        // 位置（如果启用记忆）
        ...(state.rememberPosition ? {
          position: state.position,
          size: state.size
        } : {})
      }),
      onRehydrateStorage: () => {
        return (state) => {
          if (state) {
            loggers.image.verbose("图片悬浮窗状态已恢复", {
              thumbnailSize: state.thumbnailSizePreset,
              position: state.position
            });
            // 如果设置了启动时自动打开
            if (state.autoOpenOnStart) {
              // 延迟打开，等待 UI 准备就绪
              setTimeout(() => {
                useImagePanelStore.getState().open();
              }, 500);
            }
          }
        };
      }
    }
  )
);

// ============ 便捷导出 ============

/** 获取当前缩略图尺寸（像素） */
export const getThumbnailSize = () => useImagePanelStore.getState().getThumbnailSizePixels();

/** 获取每行图片数 */
export const getImagesPerRow = () => useImagePanelStore.getState().getImagesPerRow();
