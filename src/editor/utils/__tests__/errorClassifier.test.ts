import { describe, it, expect, beforeAll } from "vitest";
import { classifyError, NasgeError } from "../errorClassifier";
import { ErrorCategory, SteamEResult } from "../../../shared/steamErrors";
import type { SteamErrorResponse } from "../../../shared/messages";
import { initI18n } from "../../../i18n";

beforeAll(async () => {
  await initI18n("zh-CN");
});

function makeErrorResponse(
  overrides: Partial<SteamErrorResponse> & { error: string }
): SteamErrorResponse {
  return { ok: false as const, ...overrides };
}

describe("classifyError — EResult 分类", () => {
  it("eresult=29 → STEAM_API + DuplicateRequest + 不可重试", () => {
    const err = classifyError(
      makeErrorResponse({ error: "上传失败", eresult: 29 })
    );
    expect(err).toBeInstanceOf(NasgeError);
    expect(err.category).toBe(ErrorCategory.STEAM_API);
    expect(err.eresult).toBe(29);
    expect(err.retryable).toBe(false);
    expect(err.message).toContain("重复上传");
  });

  it("eresult=8 → STEAM_API + InvalidParam + 不可重试", () => {
    const err = classifyError(
      makeErrorResponse({ error: "图片错误", eresult: 8 })
    );
    expect(err.category).toBe(ErrorCategory.STEAM_API);
    expect(err.eresult).toBe(8);
    expect(err.retryable).toBe(false);
  });

  it("eresult=84 → STEAM_API + 可重试", () => {
    const err = classifyError(
      makeErrorResponse({ error: "频率限制", eresult: 84 })
    );
    expect(err.retryable).toBe(true);
    expect(err.message).toContain("120秒");
  });

  it("eresult=21 → NotLoggedOn", () => {
    const err = classifyError(
      makeErrorResponse({ error: "未登录", eresult: 21 })
    );
    expect(err.eresult).toBe(21);
    expect(err.message).toContain("登录已失效");
  });

  it("未知 eresult 使用 generic 消息", () => {
    const err = classifyError(
      makeErrorResponse({ error: "unknown", eresult: 999 })
    );
    expect(err.category).toBe(ErrorCategory.STEAM_API);
    expect(err.message).toContain("999");
  });

  it("eresult=1 (OK) 不触发 eresult 分支", () => {
    const err = classifyError(
      makeErrorResponse({ error: "some error", eresult: 1 })
    );
    expect(err.category).toBe(ErrorCategory.UNKNOWN);
  });
});

describe("classifyError — HTTP 分类", () => {
  it("httpStatus=429 → NETWORK + 可重试", () => {
    const err = classifyError(
      makeErrorResponse({ error: "HTTP 429", httpStatus: 429 })
    );
    expect(err.category).toBe(ErrorCategory.NETWORK);
    expect(err.httpStatus).toBe(429);
    expect(err.retryable).toBe(true);
  });

  it("httpStatus=500 → NETWORK + 可重试", () => {
    const err = classifyError(
      makeErrorResponse({ error: "HTTP 500", httpStatus: 500 })
    );
    expect(err.category).toBe(ErrorCategory.NETWORK);
    expect(err.retryable).toBe(true);
  });

  it("httpStatus=403 → NETWORK + 不可重试 + generic 消息", () => {
    const err = classifyError(
      makeErrorResponse({ error: "HTTP 403", httpStatus: 403 })
    );
    expect(err.category).toBe(ErrorCategory.NETWORK);
    expect(err.retryable).toBe(false);
    expect(err.message).toContain("403");
  });
});

describe("classifyError — Bridge 模式匹配", () => {
  it("Could not establish connection → BRIDGE", () => {
    const err = classifyError(
      makeErrorResponse({
        error: "Could not establish connection. Receiving end does not exist.",
      })
    );
    expect(err.category).toBe(ErrorCategory.BRIDGE);
    expect(err.retryable).toBe(false);
  });

  it("message port closed → BRIDGE", () => {
    const err = classifyError(
      makeErrorResponse({
        error: "The message port closed before a response was received",
      })
    );
    expect(err.category).toBe(ErrorCategory.BRIDGE);
  });

  it("扩展权限 → BRIDGE", () => {
    const err = classifyError(
      makeErrorResponse({
        error: "扩展尚未获得访问 Steam 网页的权限",
      })
    );
    expect(err.category).toBe(ErrorCategory.BRIDGE);
  });
});

describe("classifyError — 消息文本提取 (fallback)", () => {
  it("从「返回代码：21」提取 eresult", () => {
    const err = classifyError(
      makeErrorResponse({
        error: "Steam 保存章节失败，返回代码：21",
      })
    );
    expect(err.eresult).toBe(21);
    expect(err.category).toBe(ErrorCategory.STEAM_API);
  });

  it("从「错误码 8」提取 eresult", () => {
    const err = classifyError(
      makeErrorResponse({
        error: "Steam 上传失败（错误码 8）。",
      })
    );
    expect(err.eresult).toBe(8);
  });

  it("从「HTTP 503」提取 httpStatus", () => {
    const err = classifyError(
      makeErrorResponse({
        error: "拉取章节失败：HTTP 503",
      })
    );
    expect(err.category).toBe(ErrorCategory.NETWORK);
    expect(err.httpStatus).toBe(503);
  });
});

describe("classifyError — UNKNOWN fallback", () => {
  it("完全未知的错误消息 → UNKNOWN（不暴露原始消息）", () => {
    const err = classifyError(
      makeErrorResponse({
        error: "something completely unexpected happened",
      })
    );
    expect(err.category).toBe(ErrorCategory.UNKNOWN);
    expect(err.retryable).toBe(false);
    expect(err.message).not.toContain("something completely unexpected");
    expect(err.message).toContain("操作失败");
  });
});
