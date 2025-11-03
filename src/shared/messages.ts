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

export type SteamCollectContextRequest = BridgeBase & {
  action: "collect-upload-context";
  scope: UploadScope;
};

export type SteamPingRequest = BridgeBase & {
  action: "ping";
};

export type SteamGuideImage = {
  previewId: string;
  fileName: string;
  thumbnailUrl?: string;
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

export type SteamBridgeRequest =
  | SteamUploadRequest
  | SteamCollectContextRequest
  | SteamPingRequest
  | SteamFetchGuideImagesRequest
  | SteamDeleteImageRequest
  | SteamFetchChapterRequest
  | SteamSaveChapterRequest
  | SteamFetchChapterListRequest;

export type SteamSuccessResponse<TData = unknown> = {
  ok: true;
  data: TData;
};

export type SteamErrorResponse = {
  ok: false;
  error: string;
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
