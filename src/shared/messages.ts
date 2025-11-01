export type UploadScope = "chapter-preview" | "guide-cover";

export type SerializedFilePayload = {
  name: string;
  type: string;
  data: ArrayBuffer;
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

export type SteamBridgeRequest =
  | SteamUploadRequest
  | SteamCollectContextRequest
  | SteamPingRequest;

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

export type UploadContext = {
  action: string;
  fields: Record<string, string>;
};

export type UploadResult = {
  redirectUrl: string;
  previewIds: string[];
  status: number;
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
