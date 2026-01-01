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
      size: "thumb",
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
});
