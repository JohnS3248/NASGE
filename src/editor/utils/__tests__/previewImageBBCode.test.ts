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

  // 仅空白的 previewId 也抛错（trim 后为空）
  it("throws on whitespace-only previewId", () => {
    expect(() =>
      encodePreviewImage({
        previewId: "   ",
        fileName: "a.png",
        size: "original",
        alignment: "floatLeft"
      })
    ).toThrow(/previewId 不能为空/);
  });

  // 超长 filename 原样保留
  it("preserves long filename", () => {
    const longName = "A".repeat(200) + ".png";
    expect(
      encodePreviewImage({
        previewId: "100",
        fileName: longName,
        size: "original",
        alignment: "floatLeft"
      })
    ).toBe(`[previewimg=100;sizeOriginal,floatLeft;${longName}][/previewimg]`);
  });

  // 特殊字符：Unicode 与空格保留
  it("preserves unicode and spaces in filename", () => {
    expect(
      encodePreviewImage({
        previewId: "100",
        fileName: "截图 01 — 测试.png",
        size: "original",
        alignment: "floatLeft"
      })
    ).toBe("[previewimg=100;sizeOriginal,floatLeft;截图 01 — 测试.png][/previewimg]");
  });

  // 换行字符被替换为下划线（防止破坏 BBCode 结构）
  it("replaces newline in filename with underscore", () => {
    expect(
      encodePreviewImage({
        previewId: "100",
        fileName: "bad\nname.png",
        size: "original",
        alignment: "floatLeft"
      })
    ).toBe("[previewimg=100;sizeOriginal,floatLeft;bad_name.png][/previewimg]");
  });

  // sanitize 后全空白 → fallback 到 image.jpg
  it("falls back to image.jpg when sanitize produces only whitespace", () => {
    expect(
      encodePreviewImage({
        previewId: "100",
        fileName: "   ",
        size: "original",
        alignment: "floatLeft"
      })
    ).toBe("[previewimg=100;sizeOriginal,floatLeft;image.jpg][/previewimg]");
  });

  // 防御性：非法 size 值（TypeScript 外部输入）fallback 到 sizeOriginal
  it("falls back to sizeOriginal on invalid size value", () => {
    expect(
      encodePreviewImage({
        previewId: "100",
        fileName: "a.png",
        // @ts-expect-error 故意传非法值测试 fallback
        size: "bogus",
        alignment: "floatLeft"
      })
    ).toBe("[previewimg=100;sizeOriginal,floatLeft;a.png][/previewimg]");
  });

  // 防御性：非法 alignment 值 fallback 到 floatLeft
  it("falls back to floatLeft on invalid alignment value", () => {
    expect(
      encodePreviewImage({
        previewId: "100",
        fileName: "a.png",
        size: "original",
        // @ts-expect-error 故意传非法值测试 fallback
        alignment: "bogus"
      })
    ).toBe("[previewimg=100;sizeOriginal,floatLeft;a.png][/previewimg]");
  });

  // 清理 kb 后缀（无空格小数）
  it("strips '(1.5 MB)' style suffix", () => {
    expect(
      encodePreviewImage({
        previewId: "100",
        fileName: "photo.png (1.5 MB)",
        size: "original",
        alignment: "floatLeft"
      })
    ).toBe("[previewimg=100;sizeOriginal,floatLeft;photo.png][/previewimg]");
  });
});

describe("decodePreviewImage 结构缺失", () => {
  // 只有 previewId，无 flag 段、无 filename
  it("accepts only previewId segment", () => {
    expect(decodePreviewImage("12345")).toEqual({
      previewId: "12345",
      fileName: "image.jpg",
      size: "original",
      alignment: "floatLeft"
    });
  });

  // 只有 previewId + flag 段（无 filename）
  it("accepts two segments without filename", () => {
    expect(decodePreviewImage("12345;sizeFull,floatRight")).toEqual({
      previewId: "12345",
      fileName: "image.jpg",
      size: "full",
      alignment: "floatRight"
    });
  });

  // flag 段无逗号（只有 size，无 alignment）
  it("accepts flag segment without comma", () => {
    expect(decodePreviewImage("12345;sizeFull;a.png")).toEqual({
      previewId: "12345",
      fileName: "a.png",
      size: "full",
      alignment: "floatLeft"  // 默认
    });
  });

  // flag 段只有逗号
  it("accepts flag segment with only comma", () => {
    expect(decodePreviewImage("12345;,;a.png")).toEqual({
      previewId: "12345",
      fileName: "a.png",
      size: "original",
      alignment: "floatLeft"
    });
  });

  // 超多段（;）— 超出 3 段的部分被忽略
  it("ignores extra segments beyond 3", () => {
    expect(decodePreviewImage("12345;sizeFull,floatRight;a.png;extra;more")).toEqual({
      previewId: "12345",
      fileName: "a.png",
      size: "full",
      alignment: "floatRight"
    });
  });
});
