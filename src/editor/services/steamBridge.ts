import type {
  SteamBridgeRequest,
  SteamBridgeResponse,
  SteamDeleteImageRequest,
  SteamFetchScreenshotsRequest,
  SteamUploadRequest,
  SteamFetchGuideImagesRequest,
  SteamGuideImage,
  SteamScreenshotItem,
  UploadResult,
  UploadScope
} from "../../shared/messages";
import { loggers } from "../../shared/logger";

const RUNTIME = chrome?.runtime;

function ensureRuntime(): typeof chrome.runtime {
  if (!RUNTIME) {
    throw new Error("当前环境不可访问 chrome.runtime，无法与 Steam 页面通信。");
  }
  return RUNTIME;
}

function sendSteamRequest<T extends SteamBridgeRequest>(
  message: T
): Promise<SteamBridgeResponse> {
  return new Promise((resolve, reject) => {
    try {
      ensureRuntime().sendMessage(message, (response?: SteamBridgeResponse) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response) {
          reject(new Error("Steam 页面未响应请求。"));
          return;
        }
        resolve(response);
      });
    } catch (error) {
      reject(error);
    }
  });
}

export async function uploadSteamImage(
  scope: UploadScope,
  file: File,
  originalName?: string
): Promise<UploadResult> {
  const fileData = await file.arrayBuffer();
  const fileArray = Array.from(new Uint8Array(fileData));

  loggers.bridge.info("uploadSteamImage -> 序列化文件", {
    name: file.name,
    size: file.size,
    byteLength: fileData.byteLength,
    type: file.type
  });

  const request: SteamUploadRequest = {
    channel: "nasge:steam",
    action: "upload-image",
    scope,
    file: {
      name: file.name,
      type: file.type || "application/octet-stream",
      data: fileArray,
      originalName
    }
  };

  const response = await sendSteamRequest(request);

  if (!response.ok) {
    throw new Error(response.error);
  }

  return response.data as UploadResult;
}

export async function pingSteamBridge(): Promise<void> {
  const response = await sendSteamRequest({
    channel: "nasge:steam",
    action: "ping"
  });

  if (!response.ok) {
    throw new Error(response.error);
  }
}

export async function fetchSteamGuideImages(scope: UploadScope = "chapter-preview"): Promise<SteamGuideImage[]> {
  const request: SteamFetchGuideImagesRequest = {
    channel: "nasge:steam",
    action: "fetch-guide-images",
    scope
  };

  const response = await sendSteamRequest(request);
  if (!response.ok) {
    throw new Error(response.error);
  }

  return (response.data as SteamGuideImage[]) ?? [];
}

export async function fetchSteamScreenshots(page?: number): Promise<SteamScreenshotItem[]> {
  const request: SteamFetchScreenshotsRequest = {
    channel: "nasge:steam",
    action: "fetch-screenshots",
    page
  };

  const response = await sendSteamRequest(request);
  if (!response.ok) {
    throw new Error(response.error);
  }

  return (response.data as SteamScreenshotItem[]) ?? [];
}

export async function deleteSteamImage(previewId: string, scope: UploadScope = "chapter-preview"): Promise<void> {
  const request: SteamDeleteImageRequest = {
    channel: "nasge:steam",
    action: "delete-image",
    scope,
    previewId
  };

  const response = await sendSteamRequest(request);
  if (!response.ok) {
    throw new Error(response.error);
  }
}
