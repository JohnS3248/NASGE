import type {
  ImageAlignment,
  ImageSizePreset
} from "../types/image";

// 类型别名，保持向后兼容
type ImageDisplayPreset = ImageSizePreset;

export type PreviewImageBBCode = {
  previewId: string;
  fileName: string;
  size: ImageDisplayPreset;
  alignment: ImageAlignment;
};

const SIZE_TOKENS: Record<ImageDisplayPreset, string> = {
  original: "sizeOriginal",
  full: "sizeFull",
  half: "sizeThumb",  // Steam BBCode: 半宽 = sizeThumb
  thumb: "sizeThumb"
};

const ALIGNMENT_TOKENS: Record<ImageAlignment, string> = {
  floatLeft: "floatLeft",
  floatRight: "floatRight",
  inline: "inline"
};

const DEFAULT_SIZE: ImageDisplayPreset = "original";
const DEFAULT_ALIGNMENT: ImageAlignment = "floatLeft";

/**
 * 将图片信息编码为 Steam BBCode 格式
 */
export function encodePreviewImage(attrs: PreviewImageBBCode): string {
  const previewId = attrs.previewId.trim();

  if (!previewId) {
    throw new Error("previewId 不能为空");
  }

  const sizeToken = SIZE_TOKENS[attrs.size] ?? SIZE_TOKENS[DEFAULT_SIZE];
  const alignmentToken =
    ALIGNMENT_TOKENS[attrs.alignment] ?? ALIGNMENT_TOKENS[DEFAULT_ALIGNMENT];

  const sanitizedFileName = sanitizeFileName(attrs.fileName);

  return `[previewimg=${previewId};${sizeToken},${alignmentToken};${sanitizedFileName}][/previewimg]`;
}

/**
 * 解析 Steam BBCode 格式的图片标签
 * @param rawValue BBCode 标签的参数部分（不包括 [previewimg=] 和 [/previewimg]）
 * @returns 解析后的图片属性
 */
export function decodePreviewImage(rawValue: string | null | undefined): PreviewImageBBCode {
  if (!rawValue) {
    throw new Error("预期的 previewimg 标签缺少参数。");
  }

  const segments = rawValue.split(";");
  const previewId = segments[0]?.trim() ?? "";

  if (!previewId) {
    throw new Error("previewimg 标签缺少 previewId");
  }

  const flagSegment = segments[1] ?? "";
  const [sizeTokenRaw, alignmentTokenRaw] = flagSegment.split(",");

  const fileName = (segments[2] ?? "").trim() || "image.jpg";

  const sizeToken = sizeTokenRaw?.trim() ?? "";
  const alignmentToken = alignmentTokenRaw?.trim() ?? "";

  const size = parseSizeToken(sizeToken);
  const alignment = parseAlignmentToken(alignmentToken);

  return {
    previewId,
    fileName,
    size,
    alignment
  };
}

export function parseSizeToken(token: string): ImageDisplayPreset {
  const entry = Object.entries(SIZE_TOKENS).find(
    ([, value]) => value.toLowerCase() === token.toLowerCase()
  );
  return (entry?.[0] as ImageDisplayPreset) ?? DEFAULT_SIZE;
}

export function parseAlignmentToken(token: string): ImageAlignment {
  const entry = Object.entries(ALIGNMENT_TOKENS).find(
    ([, value]) => value.toLowerCase() === token.toLowerCase()
  );
  return (entry?.[0] as ImageAlignment) ?? DEFAULT_ALIGNMENT;
}

function sanitizeFileName(fileName: string): string {
  if (!fileName) {
    return "image.jpg";
  }
  // 清理文件大小后缀，如 "(242.403 kb)"、"(1.5 MB)" 等
  // Steam DOM 的 .preview_title 元素可能包含这些信息
  let cleaned = fileName.replace(/\s*\(\d+(\.\d+)?\s*(b|kb|mb|gb)\)\s*$/i, "");
  // 清理 BBCode 非法字符
  cleaned = cleaned.replace(/[;\r\n]/g, "_");
  return cleaned.trim() || "image.jpg";
}
