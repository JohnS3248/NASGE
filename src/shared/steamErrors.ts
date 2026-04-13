/**
 * Steam EResult 错误码枚举、分类与元数据
 *
 * 纯数据模块，无 i18n 依赖。content script 和 editor 均可导入。
 * 来源：Steamworks 官方文档 partner.steamgames.com/doc/api/steam_api
 * 调研文档：docs/errorhandle/steam-error-codes-research.md
 */

// ============================================================================
// EResult 枚举（NASGE 相关子集）
// ============================================================================

export enum SteamEResult {
  OK = 1,
  Fail = 2,
  NoConnection = 3,
  InvalidParam = 8,
  Busy = 10,
  InvalidState = 11,
  AccessDenied = 15,
  Timeout = 16,
  ServiceUnavailable = 20,
  NotLoggedOn = 21,
  InsufficientPrivilege = 24,
  LimitExceeded = 25,
  DuplicateRequest = 29,
  AccountDisabled = 43,
  ServiceReadOnly = 44,
  AccountLockedDown = 73,
  UnexpectedError = 79,
  RateLimitExceeded = 84,
  ItemDeleted = 86,
  AccountLimitExceeded = 95,
  AccountActivityLimitExceeded = 96,
  TooManyPending = 108,
}

// ============================================================================
// 错误分类枚举
// ============================================================================

export enum ErrorCategory {
  /** Steam 后端 EResult 错误（来自 success 字段或 fileuploadsuccess 参数） */
  STEAM_API = "STEAM_API",
  /** 网络层错误（HTTP 状态码、超时、连接断开） */
  NETWORK = "NETWORK",
  /** 扩展通信错误（内容脚本连接、权限、端口关闭） */
  BRIDGE = "BRIDGE",
  /** 客户端验证错误（文件大小、格式、BBCode 格式） */
  VALIDATION = "VALIDATION",
  /** 无法分类的未知错误 */
  UNKNOWN = "UNKNOWN",
}

// ============================================================================
// EResult 元数据映射
// ============================================================================

export interface EResultMeta {
  name: string;
  category: ErrorCategory;
  retryable: boolean;
}

export const ERESULT_META: Record<number, EResultMeta> = {
  [SteamEResult.OK]: {
    name: "OK",
    category: ErrorCategory.STEAM_API,
    retryable: false,
  },
  [SteamEResult.Fail]: {
    name: "Fail",
    category: ErrorCategory.STEAM_API,
    retryable: true,
  },
  [SteamEResult.NoConnection]: {
    name: "NoConnection",
    category: ErrorCategory.NETWORK,
    retryable: true,
  },
  [SteamEResult.InvalidParam]: {
    name: "InvalidParam",
    category: ErrorCategory.STEAM_API,
    retryable: false,
  },
  [SteamEResult.Busy]: {
    name: "Busy",
    category: ErrorCategory.STEAM_API,
    retryable: true,
  },
  [SteamEResult.InvalidState]: {
    name: "InvalidState",
    category: ErrorCategory.STEAM_API,
    retryable: false,
  },
  [SteamEResult.AccessDenied]: {
    name: "AccessDenied",
    category: ErrorCategory.STEAM_API,
    retryable: false,
  },
  [SteamEResult.Timeout]: {
    name: "Timeout",
    category: ErrorCategory.NETWORK,
    retryable: true,
  },
  [SteamEResult.ServiceUnavailable]: {
    name: "ServiceUnavailable",
    category: ErrorCategory.NETWORK,
    retryable: true,
  },
  [SteamEResult.NotLoggedOn]: {
    name: "NotLoggedOn",
    category: ErrorCategory.STEAM_API,
    retryable: false,
  },
  [SteamEResult.InsufficientPrivilege]: {
    name: "InsufficientPrivilege",
    category: ErrorCategory.STEAM_API,
    retryable: false,
  },
  [SteamEResult.LimitExceeded]: {
    name: "LimitExceeded",
    category: ErrorCategory.STEAM_API,
    retryable: false,
  },
  [SteamEResult.DuplicateRequest]: {
    name: "DuplicateRequest",
    category: ErrorCategory.STEAM_API,
    retryable: false,
  },
  [SteamEResult.AccountDisabled]: {
    name: "AccountDisabled",
    category: ErrorCategory.STEAM_API,
    retryable: false,
  },
  [SteamEResult.ServiceReadOnly]: {
    name: "ServiceReadOnly",
    category: ErrorCategory.STEAM_API,
    retryable: true,
  },
  [SteamEResult.AccountLockedDown]: {
    name: "AccountLockedDown",
    category: ErrorCategory.STEAM_API,
    retryable: false,
  },
  [SteamEResult.UnexpectedError]: {
    name: "UnexpectedError",
    category: ErrorCategory.STEAM_API,
    retryable: true,
  },
  [SteamEResult.RateLimitExceeded]: {
    name: "RateLimitExceeded",
    category: ErrorCategory.STEAM_API,
    retryable: true,
  },
  [SteamEResult.ItemDeleted]: {
    name: "ItemDeleted",
    category: ErrorCategory.STEAM_API,
    retryable: false,
  },
  [SteamEResult.AccountLimitExceeded]: {
    name: "AccountLimitExceeded",
    category: ErrorCategory.STEAM_API,
    retryable: false,
  },
  [SteamEResult.AccountActivityLimitExceeded]: {
    name: "AccountActivityLimitExceeded",
    category: ErrorCategory.STEAM_API,
    retryable: true,
  },
  [SteamEResult.TooManyPending]: {
    name: "TooManyPending",
    category: ErrorCategory.STEAM_API,
    retryable: true,
  },
};

// ============================================================================
// SteamBridgeError — 可携带结构化错误码的 Error 子类
// ============================================================================

export class SteamBridgeError extends Error {
  readonly eresult?: number;
  readonly httpStatus?: number;

  constructor(
    message: string,
    options?: { eresult?: number; httpStatus?: number }
  ) {
    super(message);
    this.name = "SteamBridgeError";
    this.eresult = options?.eresult;
    this.httpStatus = options?.httpStatus;
  }
}
