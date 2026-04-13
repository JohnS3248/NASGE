import { describe, it, expect } from "vitest";
import {
  SteamEResult,
  ErrorCategory,
  ERESULT_META,
  SteamBridgeError,
} from "../steamErrors";

describe("SteamEResult", () => {
  it("包含所有预期的错误码", () => {
    expect(SteamEResult.OK).toBe(1);
    expect(SteamEResult.Fail).toBe(2);
    expect(SteamEResult.InvalidParam).toBe(8);
    expect(SteamEResult.DuplicateRequest).toBe(29);
    expect(SteamEResult.RateLimitExceeded).toBe(84);
    expect(SteamEResult.UnexpectedError).toBe(79);
  });
});

describe("ERESULT_META", () => {
  it("每个枚举值都有对应的元数据", () => {
    const codes = Object.values(SteamEResult).filter(
      (v): v is number => typeof v === "number"
    );
    for (const code of codes) {
      expect(ERESULT_META[code]).toBeDefined();
      expect(ERESULT_META[code].name).toBeTruthy();
      expect(Object.values(ErrorCategory)).toContain(
        ERESULT_META[code].category
      );
      expect(typeof ERESULT_META[code].retryable).toBe("boolean");
    }
  });

  it("Error 8 (InvalidParam) 不可重试", () => {
    const meta = ERESULT_META[SteamEResult.InvalidParam];
    expect(meta.retryable).toBe(false);
    expect(meta.category).toBe(ErrorCategory.STEAM_API);
  });

  it("Error 29 (DuplicateRequest) 不可重试", () => {
    const meta = ERESULT_META[SteamEResult.DuplicateRequest];
    expect(meta.retryable).toBe(false);
  });

  it("Error 84 (RateLimitExceeded) 可重试", () => {
    const meta = ERESULT_META[SteamEResult.RateLimitExceeded];
    expect(meta.retryable).toBe(true);
  });

  it("Timeout 和 ServiceUnavailable 归为 NETWORK 分类", () => {
    expect(ERESULT_META[SteamEResult.Timeout].category).toBe(
      ErrorCategory.NETWORK
    );
    expect(ERESULT_META[SteamEResult.ServiceUnavailable].category).toBe(
      ErrorCategory.NETWORK
    );
  });
});

describe("SteamBridgeError", () => {
  it("携带 eresult 字段", () => {
    const err = new SteamBridgeError("test", { eresult: 29 });
    expect(err.message).toBe("test");
    expect(err.eresult).toBe(29);
    expect(err.httpStatus).toBeUndefined();
    expect(err.name).toBe("SteamBridgeError");
    expect(err instanceof Error).toBe(true);
  });

  it("携带 httpStatus 字段", () => {
    const err = new SteamBridgeError("HTTP 500", { httpStatus: 500 });
    expect(err.httpStatus).toBe(500);
    expect(err.eresult).toBeUndefined();
  });

  it("无选项时字段为 undefined", () => {
    const err = new SteamBridgeError("plain error");
    expect(err.eresult).toBeUndefined();
    expect(err.httpStatus).toBeUndefined();
  });
});
