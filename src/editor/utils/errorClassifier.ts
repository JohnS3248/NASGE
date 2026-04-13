/**
 * 统一错误分类器
 *
 * 将 Steam 错误响应（eresult / httpStatus / 消息文本）分类为用户友好的
 * NasgeError，携带 i18n key 和分类信息。
 *
 * 分类优先级：eresult → httpStatus → 消息模式匹配 → UNKNOWN
 */

import i18n from "i18next";
import type { SteamErrorResponse } from "../../shared/messages";
import {
  ErrorCategory,
  ERESULT_META,
  SteamEResult,
} from "../../shared/steamErrors";

// ============================================================================
// NasgeError — 分类后的错误对象
// ============================================================================

export class NasgeError extends Error {
  readonly category: ErrorCategory;
  readonly eresult?: number;
  readonly httpStatus?: number;
  readonly retryable: boolean;

  constructor(opts: {
    message: string;
    category: ErrorCategory;
    eresult?: number;
    httpStatus?: number;
    retryable: boolean;
  }) {
    super(opts.message);
    this.name = "NasgeError";
    this.category = opts.category;
    this.eresult = opts.eresult;
    this.httpStatus = opts.httpStatus;
    this.retryable = opts.retryable;
  }
}

// ============================================================================
// Bridge 错误模式
// ============================================================================

interface BridgePattern {
  test: (msg: string) => boolean;
  i18nKey: string;
}

const BRIDGE_PATTERNS: BridgePattern[] = [
  {
    test: (m) =>
      m.includes("Could not establish connection") ||
      m.includes("Receiving end does not exist"),
    i18nKey: "steamError.bridge.noConnection",
  },
  {
    test: (m) => m.includes("message port closed"),
    i18nKey: "steamError.bridge.portClosed",
  },
  {
    test: (m) => m.includes("扩展尚未获得访问"),
    i18nKey: "steamError.bridge.noPermission",
  },
  {
    test: (m) =>
      m.includes("未找到已打开的 Steam") ||
      m.includes("No open Steam page"),
    i18nKey: "steamError.bridge.noSteamPage",
  },
];

// ============================================================================
// 分类主函数
// ============================================================================

/**
 * 将 SteamErrorResponse 分类为 NasgeError
 *
 * @param response - 错误响应（来自 content script → background → editor）
 * @returns 分类后的 NasgeError，message 已为 i18n 解析后的用户友好文本
 */
export function classifyError(response: SteamErrorResponse): NasgeError {
  const { error: rawMessage, eresult, httpStatus } = response;

  // 1. 优先：有明确的 EResult 码
  if (eresult !== undefined && eresult !== SteamEResult.OK) {
    return classifyByEResult(eresult, rawMessage);
  }

  // 2. 其次：有 HTTP 状态码
  if (httpStatus !== undefined && httpStatus >= 400) {
    return classifyByHttpStatus(httpStatus, rawMessage);
  }

  // 3. 尝试从消息文本中提取 EResult（兼容旧路径 / 未富化的错误）
  const extractedEResult = extractEResultFromMessage(rawMessage);
  if (extractedEResult !== undefined) {
    return classifyByEResult(extractedEResult, rawMessage);
  }

  // 4. 尝试从消息文本中提取 HTTP 状态码
  const extractedHttp = extractHttpStatusFromMessage(rawMessage);
  if (extractedHttp !== undefined) {
    return classifyByHttpStatus(extractedHttp, rawMessage);
  }

  // 5. Bridge 模式匹配
  for (const pattern of BRIDGE_PATTERNS) {
    if (pattern.test(rawMessage)) {
      return new NasgeError({
        message: i18n.t(pattern.i18nKey, { ns: "editor" }),
        category: ErrorCategory.BRIDGE,
        retryable: false,
      });
    }
  }

  // 6. Fallback: UNKNOWN（原始消息保留在 console 日志中，不暴露给用户）
  return new NasgeError({
    message: i18n.t("steamError.unknown", { ns: "editor" }),
    category: ErrorCategory.UNKNOWN,
    retryable: false,
  });
}

// ============================================================================
// 内部分类器
// ============================================================================

function classifyByEResult(code: number, rawMessage: string): NasgeError {
  const meta = ERESULT_META[code];
  const i18nKey = `steamError.eresult.${code}`;
  const hasSpecificKey = i18n.exists(i18nKey, { ns: "editor" });

  const message = hasSpecificKey
    ? i18n.t(i18nKey, { ns: "editor" })
    : i18n.t("steamError.eresult.generic", { ns: "editor", code });

  return new NasgeError({
    message,
    category: meta?.category ?? ErrorCategory.STEAM_API,
    eresult: code,
    retryable: meta?.retryable ?? false,
  });
}

function classifyByHttpStatus(
  status: number,
  rawMessage: string
): NasgeError {
  const specificKeys: Record<number, string> = {
    429: "steamError.http.429",
    500: "steamError.http.500",
    503: "steamError.http.503",
  };

  const i18nKey = specificKeys[status] ?? "steamError.http.generic";
  const message = i18n.t(i18nKey, { ns: "editor", status });

  const retryable = status === 429 || status >= 500;

  return new NasgeError({
    message,
    category: ErrorCategory.NETWORK,
    httpStatus: status,
    retryable,
  });
}

// ============================================================================
// 消息文本解析（向后兼容 fallback）
// ============================================================================

/**
 * 从错误消息文本中提取 EResult 码
 * 匹配模式：`返回代码：N`、`错误码 N`、`success=N`、`fileuploadsuccess=N`
 */
function extractEResultFromMessage(msg: string): number | undefined {
  const patterns = [
    /返回代码[：:]\s*(\d+)/,
    /错误码\s*(\d+)/,
    /success[=＝]\s*(\d+)/,
    /fileuploadsuccess[=＝]\s*(\d+)/,
  ];

  for (const re of patterns) {
    const match = re.exec(msg);
    if (match) {
      const code = parseInt(match[1], 10);
      if (!isNaN(code) && code !== 1) {
        return code;
      }
    }
  }

  return undefined;
}

/**
 * 从错误消息文本中提取 HTTP 状态码
 * 匹配模式：`HTTP 404`、`HTTP 500`
 */
function extractHttpStatusFromMessage(msg: string): number | undefined {
  const match = /HTTP\s+(\d{3})/.exec(msg);
  if (match) {
    const status = parseInt(match[1], 10);
    if (status >= 400) {
      return status;
    }
  }
  return undefined;
}
