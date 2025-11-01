import type {
  SteamBridgeRequest,
  SteamBridgeResponse,
  SteamUploadRequest,
  UploadResult,
  UploadScope
} from "../../shared/messages";

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
  file: File
): Promise<UploadResult> {
  const fileData = await file.arrayBuffer();

  const request: SteamUploadRequest = {
    channel: "nasge:steam",
    action: "upload-image",
    scope,
    file: {
      name: file.name,
      type: file.type || "application/octet-stream",
      data: fileData
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
