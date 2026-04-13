export type UploadScope = "chapter-preview" | "guide-cover";

export type SerializedFilePayload = {
  name: string;
  type: string;
  data: ArrayBuffer | number[];
  originalName?: string;
};

type BridgeBase = {
  channel: "nasge:steam";
  requestId?: string;
};

export type SteamUploadRequest = BridgeBase & {
  action: "upload-image";
  scope: UploadScope;
  file: SerializedFilePayload;
};

export type SteamPingRequest = BridgeBase & {
  action: "ping";
};

export type SteamGuideImage = {
  previewId: string;
  fileName: string;
  thumbnailUrl?: string;
  originalUrl?: string;  // 完整的透明背景图片 URL
};

export type SteamFetchGuideImagesRequest = BridgeBase & {
  action: "fetch-guide-images";
  scope: UploadScope;
};

export type SteamDeleteImageRequest = BridgeBase & {
  action: "delete-image";
  scope: UploadScope;
  previewId: string;
};

export type SteamFetchChapterRequest = BridgeBase & {
  action: "fetch-chapter";
  guideId: string;
  sectionId: string;
};

export type SteamSaveChapterRequest = BridgeBase & {
  action: "save-chapter";
  guideId: string;
  sectionId?: string;
  title: string;
  description: string;
  sessionId?: string;  // 可选：从 MAIN world 传递的 sessionid
};

export type SteamFetchChapterListRequest = BridgeBase & {
  action: "fetch-chapter-list";
  guideId: string;
};

export type SteamFetchGuideInfoRequest = BridgeBase & {
  action: "fetch-guide-info";
  guideId: string;
};

// === 评测相关 ===

export type ReviewFormData = {
  text: string;
  ratedUp: boolean | null;
  visibility: "public" | "friends";
  language: string;
  enableComments: boolean;
  attachHardware: boolean;
  receivedCompensation: boolean;
  appId: string;
  gameName: string;
  hasExistingReview: boolean;
  recommendationId: string | null;
};

export type SteamFetchReviewRequest = BridgeBase & {
  action: "fetch-review";
};

export type SteamWriteReviewTextRequest = BridgeBase & {
  action: "write-review-text";
  text: string;
};

export type SteamSubmitReviewRequest = BridgeBase & {
  action: "submit-review";
  data: {
    comment: string;
    rated_up: boolean;
    is_public: boolean;
    language: string;
    received_compensation: number;
    disable_comments: number;
  };
};

// === 截图相关 ===

export type SteamScreenshotItem = {
  publishedfileid: string;
  imageUrl: string;
  previewUrl: string;
  filename: string;
  description: string;
  width: number;
  height: number;
  fileSize: number;
  timeCreated: number;
};

export type SteamFetchScreenshotsRequest = BridgeBase & {
  action: "fetch-screenshots";
  page?: number;  // 默认 1
};

export type SteamVerifyImageUrlRequest = BridgeBase & {
  action: "verify-image-url";
  url: string;
  timeout?: number;  // 毫秒,默认 5000
};

export type SteamBridgeRequest =
  | SteamUploadRequest
  | SteamPingRequest
  | SteamFetchGuideImagesRequest
  | SteamDeleteImageRequest
  | SteamFetchChapterRequest
  | SteamSaveChapterRequest
  | SteamFetchChapterListRequest
  | SteamFetchGuideInfoRequest
  | SteamFetchReviewRequest
  | SteamWriteReviewTextRequest
  | SteamSubmitReviewRequest
  | SteamFetchScreenshotsRequest
  | SteamVerifyImageUrlRequest;

export type SteamSuccessResponse<TData = unknown> = {
  ok: true;
  data: TData;
};

export type SteamErrorResponse = {
  ok: false;
  error: string;
  /** Steam EResult 错误码（当可从 API 响应中提取时） */
  eresult?: number;
  /** HTTP 状态码（当错误源自 HTTP 请求失败时） */
  httpStatus?: number;
};

export type SteamBridgeResponse<TData = unknown> =
  | SteamSuccessResponse<TData>
  | SteamErrorResponse;

export type UploadResult = {
  redirectUrl: string;
  previewIds: string[];
  status: number;
};

export type UploadContext = {
  action: string;
  fields: Record<string, string>;
  fileFieldName: string;
  fileInputMultiple: boolean;
};

export type SteamPageBridgeRequest = SteamBridgeRequest & {
  direction: "page->content";
};

export type SteamPageBridgeResponse = {
  channel: "nasge:steam";
  direction: "content->page";
  requestId?: string;
  response: SteamBridgeResponse;
};
