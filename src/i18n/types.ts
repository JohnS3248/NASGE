/**
 * i18next 类型增强
 *
 * 注意：暂不启用严格类型检查（CustomTypeOptions），因为迁移期间
 * 大量组件使用动态 key（如 `menu.${id}`），严格模式会导致类型错误。
 * 等全部迁移完成后可以考虑启用。
 *
 * 资源类型参考（用于 IDE 提示）：
 * - common: 共享通用文本
 * - editor: 编辑器 UI
 * - settings: 设置面板
 * - popup: 弹出窗口
 */

export type LocaleCode = "zh-CN" | "en-US";
export type LocaleSetting = "auto" | LocaleCode;
