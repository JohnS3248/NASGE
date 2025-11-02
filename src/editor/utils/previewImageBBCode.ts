import type {
  ImageAlignment,
  ImageDisplayPreset
} from "../stores/useEditorImageNodeStore";

export type PreviewImageBBCode = {
  previewId: string;
  fileName: string;
  size: ImageDisplayPreset;
  alignment: ImageAlignment;
};

const SIZE_TOKENS: Record<ImageDisplayPreset, string> = {
  original: "sizeOriginal",
  full: "sizeFull",
  half: "sizeHalf",
  thumb: "sizeThumb"
};

const ALIGNMENT_TOKENS: Record<ImageAlignment, string> = {
  floatLeft: "floatLeft",
  floatRight: "floatRight",
  inline: "inline"
};

const DEFAULT_SIZE: ImageDisplayPreset = "original";
const DEFAULT_ALIGNMENT: ImageAlignment = "floatLeft";

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

export function decodePreviewImage(rawValue: string | null | undefined): PreviewImageBBCode {
  if (!rawValue) {
    throw new Error("预期的 previewimg 标签缺少参数。");
  }

  const segments = rawValue.split(";");
  const previewId = segments[0]?.trim() ?? "";
  if (!previewId) {
    throw new Error("previewimg 标签缺少 previewId。");
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

function parseSizeToken(token: string): ImageDisplayPreset {
  const entry = Object.entries(SIZE_TOKENS).find(
    ([, value]) => value.toLowerCase() === token.toLowerCase()
  );
  return (entry?.[0] as ImageDisplayPreset) ?? DEFAULT_SIZE;
}

function parseAlignmentToken(token: string): ImageAlignment {
  const entry = Object.entries(ALIGNMENT_TOKENS).find(
    ([, value]) => value.toLowerCase() === token.toLowerCase()
  );
  return (entry?.[0] as ImageAlignment) ?? DEFAULT_ALIGNMENT;
}

function sanitizeFileName(fileName: string): string {
  if (!fileName) {
    return "image.jpg";
  }
  return fileName.replace(/[;\r\n]/g, "_");
}
