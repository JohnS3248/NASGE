import type { EditorMode } from "../stores/useGuideStore";

/** Tour 持久化状态（存入 useEditorConfigStore） */
export type TourState = {
  /** 基础 tour 是否完成（或已跳过） */
  basicCompleted: boolean;
  /** 高级 tour 是否完成 */
  advancedCompleted: boolean;
  /** 上次显示 tour 时的版本号（预留：重大更新自动重弹） */
  lastSeenVersion: string;
  /** 用户跳过 tour 的时间戳（可选，分析用） */
  skippedAt?: number;
};

export const DEFAULT_TOUR: TourState = {
  basicCompleted: false,
  advancedCompleted: false,
  lastSeenVersion: "",
};

/** Tour 步骤定义（用于构建 driver.js steps） */
export type TourStepDef = {
  id: string;
  tier: "basic" | "advanced";
  /** CSS 选择器；undefined = 居中浮层（无高亮目标） */
  selector?: string;
  titleKey: string;
  descriptionKey: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /** 仅在指定模式下显示；undefined = 全部模式 */
  showOnModes?: EditorMode[];
  /** 高亮前执行：用于强制唤出 UI（展开面板、打开悬浮窗等） */
  prepare?: () => void | Promise<void>;
};
