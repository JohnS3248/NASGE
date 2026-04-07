import { describe, expect, it } from "vitest";
import {
  decodePreviewImage,
  encodePreviewImage,
  type PreviewImageBBCode
} from "../previewImageBBCode";

const base: PreviewImageBBCode = {
  previewId: "10000004",
  fileName: "Legacy.jpg",
  size: "original",
  alignment: "floatLeft"
};

describe("encodePreviewImage", () => {
  it("encodes default attributes", () => {
    expect(encodePreviewImage(base)).toBe(
      "[previewimg=10000004;sizeOriginal,floatLeft;Legacy.jpg][/previewimg]"
    );
  });

  it("encodes different size and alignment", () => {
    expect(
      encodePreviewImage({
        ...base,
        size: "half",
        alignment: "floatRight",
        fileName: "Screenshot 01.png"
      })
    ).toBe(
      "[previewimg=10000004;sizeThumb,floatRight;Screenshot 01.png][/previewimg]"
    );
  });

  it("sanitizes illegal characters in file name", () => {
    expect(
      encodePreviewImage({
        ...base,
        fileName: "Bad;Name.jpg"
      })
    ).toBe(
      "[previewimg=10000004;sizeOriginal,floatLeft;Bad_Name.jpg][/previewimg]"
    );
  });
});

describe("decodePreviewImage", () => {
  it("decodes full parameter string", () => {
    expect(
      decodePreviewImage("10000004;sizeThumb,floatLeft;Legacy.jpg")
    ).toEqual({
      previewId: "10000004",
      fileName: "Legacy.jpg",
      size: "half",  // sizeThumb 的标准内部名是 "half"
      alignment: "floatLeft"
    });
  });

  it("falls back to defaults when optional flags missing", () => {
    expect(decodePreviewImage("555; ; ")).toEqual({
      previewId: "555",
      fileName: "image.jpg",
      size: "original",
      alignment: "floatLeft"
    });
  });

  it("throws when previewId missing", () => {
    expect(() => decodePreviewImage(";sizeOriginal,floatLeft;test.jpg")).toThrow(
      /previewimg 标签缺少 previewId/
    );
  });

  // 边界：null / undefined / 空字符串都应抛"缺少参数"错误
  it("throws when rawValue is null", () => {
    expect(() => decodePreviewImage(null)).toThrow(/缺少参数/);
  });

  it("throws when rawValue is undefined", () => {
    expect(() => decodePreviewImage(undefined)).toThrow(/缺少参数/);
  });

  it("throws when rawValue is empty string", () => {
    expect(() => decodePreviewImage("")).toThrow(/缺少参数/);
  });

  // 边界：sizeFull token 解码
  it("decodes sizeFull token", () => {
    expect(decodePreviewImage("100;sizeFull,floatLeft;a.png").size).toBe("full");
  });

  // 边界：未知 token 时 fallback 到默认
  it("falls back to default size on unknown token", () => {
    expect(decodePreviewImage("100;sizeUnknown,floatLeft;a.png").size).toBe("original");
  });

  it("falls back to default alignment on unknown token", () => {
    expect(decodePreviewImage("100;sizeOriginal,floatUnknown;a.png").alignment).toBe("floatLeft");
  });
});

describe("encodePreviewImage 边界", () => {
  // 编码 sizeFull 路径
  it("encodes sizeFull", () => {
    expect(
      encodePreviewImage({
        previewId: "100",
        fileName: "a.png",
        size: "full",
        alignment: "inline"
      })
    ).toBe("[previewimg=100;sizeFull,inline;a.png][/previewimg]");
  });

  // 编码 thumb 路径（与 half 共享 sizeThumb token）
  it("encodes thumb size", () => {
    expect(
      encodePreviewImage({
        previewId: "100",
        fileName: "a.png",
        size: "thumb",
        alignment: "floatRight"
      })
    ).toBe("[previewimg=100;sizeThumb,floatRight;a.png][/previewimg]");
  });

  // sanitizeFileName 处理大小后缀
  it("strips size suffix from filename", () => {
    expect(
      encodePreviewImage({
        previewId: "100",
        fileName: "screenshot.png (242.403 kb)",
        size: "original",
        alignment: "floatLeft"
      })
    ).toBe("[previewimg=100;sizeOriginal,floatLeft;screenshot.png][/previewimg]");
  });

  // sanitizeFileName 空文件名 → fallback
  it("falls back to image.jpg on empty filename", () => {
    expect(
      encodePreviewImage({
        previewId: "100",
        fileName: "",
        size: "original",
        alignment: "floatLeft"
      })
    ).toBe("[previewimg=100;sizeOriginal,floatLeft;image.jpg][/previewimg]");
  });

  // 空 previewId 抛错
  it("throws on empty previewId", () => {
    expect(() =>
      encodePreviewImage({
        previewId: "",
        fileName: "a.png",
        size: "original",
        alignment: "floatLeft"
      })
    ).toThrow(/previewId 不能为空/);
  });
});
