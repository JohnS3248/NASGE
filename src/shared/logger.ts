/**
 * 统一日志管理工具
 * 根据调试模式控制控制台输出
 */

// 日志级别
export type LogLevel = 'verbose' | 'info' | 'warn' | 'error';

// 日志配置（在 Store 初始化前使用的临时存储）
let _debugMode = false; // 默认关闭，生产环境

/**
 * 设置调试模式
 * 由 useEditorConfigStore 调用
 */
export function setDebugMode(enabled: boolean): void {
  _debugMode = enabled;
}

/**
 * 获取当前调试模式状态
 */
export function isDebugMode(): boolean {
  return _debugMode;
}

/**
 * 日志工具对象
 */
export const logger = {
  /**
   * 详细日志 - 仅在调试模式下输出
   * 用于持久化、状态变更等频繁操作
   */
  verbose: (prefix: string, message: string, ...args: unknown[]) => {
    if (_debugMode) {
      console.log(`[${prefix}]`, message, ...args);
    }
  },

  /**
   * 信息日志 - 仅在调试模式下输出
   * 用于关键操作记录
   */
  info: (prefix: string, message: string, ...args: unknown[]) => {
    if (_debugMode) {
      console.info(`[${prefix}]`, message, ...args);
    }
  },

  /**
   * 警告日志 - 仅在调试模式下输出
   * 用于非致命问题提示
   */
  warn: (prefix: string, message: string, ...args: unknown[]) => {
    if (_debugMode) {
      console.warn(`[${prefix}]`, message, ...args);
    }
  },

  /**
   * 错误日志 - 始终输出
   * 用于需要注意的错误
   */
  error: (prefix: string, message: string, ...args: unknown[]) => {
    // 错误始终输出，不受调试模式影响
    console.error(`[${prefix}]`, message, ...args);
  },

  /**
   * 分组日志 - 仅在调试模式下输出
   */
  group: (label: string) => {
    if (_debugMode) {
      console.group(label);
    }
  },

  groupEnd: () => {
    if (_debugMode) {
      console.groupEnd();
    }
  },

  /**
   * 表格日志 - 仅在调试模式下输出
   */
  table: (data: unknown) => {
    if (_debugMode) {
      console.table(data);
    }
  }
};

// 快捷方式：为常用模块创建专用 logger
export const createLogger = (prefix: string) => ({
  verbose: (message: string, ...args: unknown[]) => logger.verbose(prefix, message, ...args),
  info: (message: string, ...args: unknown[]) => logger.info(prefix, message, ...args),
  warn: (message: string, ...args: unknown[]) => logger.warn(prefix, message, ...args),
  error: (message: string, ...args: unknown[]) => logger.error(prefix, message, ...args)
});

// 预定义常用模块的 logger
export const loggers = {
  persist: createLogger('NASGE Persist'),
  store: createLogger('NASGE Store'),
  editor: createLogger('NASGE Editor'),
  image: createLogger('NASGE Image'),
  sync: createLogger('NASGE Sync'),
  config: createLogger('NASGE Config'),
  bridge: createLogger('NASGE Bridge'),
  popup: createLogger('NASGE Popup'),
  background: createLogger('NASGE Background'),
  content: createLogger('NASGE Content')
};
