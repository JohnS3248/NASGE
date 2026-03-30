declare global {
  interface Window {
    __NASGE_STEAM_CONTENT_INITIALIZED__?: boolean;
  }
}

import type {
  SteamBridgeRequest,
  SteamBridgeResponse,
  SteamDeleteImageRequest,
  SteamFetchChapterRequest,
  SteamSaveChapterRequest,
  SteamFetchChapterListRequest,
  SteamFetchGuideInfoRequest,
  SteamGuideImage,
  SteamPageBridgeRequest,
  SteamPageBridgeResponse,
  SteamUploadRequest,
  UploadResult
} from "../shared/messages";
import type { ChapterContent } from "./chapterSync";
import type { GuideInfoResult } from "./guideInfo";
import { handleUploadRequest, fetchGuideImagePool, deleteGuideImage } from "./steamBridge";
import { loggers, setDebugMode } from "../shared/logger";

setDebugMode(false);

(() => {
  if (window.__NASGE_STEAM_CONTENT_INITIALIZED__) {
    return;
  }
  window.__NASGE_STEAM_CONTENT_INITIALIZED__ = true;

  loggers.content.info("Content script injected:", window.location.href);

  chrome.runtime.onMessage.addListener(
    (message: SteamBridgeRequest, sender, sendResponse) => {
      if (message?.channel !== "nasge:steam") {
        return;
      }

      void dispatchSteamBridgeMessage(message, sendResponse);
      return true;
    }
  );

  chrome.runtime.sendMessage({ type: "PING_FROM_CONTENT" }, (response) => {
    if (chrome.runtime.lastError) {
      loggers.content.verbose(
        "Background ping failed:",
        chrome.runtime.lastError.message
      );
      return;
    }

    loggers.content.verbose("Background response:", response);
  });

  window.addEventListener("message", handlePageBridgeMessage);
})();

type DispatchPayload =
  | UploadResult
  | { ready: boolean }
  | { success: boolean }
  | SteamGuideImage[]
  | ChapterContent
  | { sectionId: string }
  | { chapters: Array<{ sectionId: string; title: string; order: number; titleImageUrl?: string }> }
  | GuideInfoResult;

async function dispatchSteamBridgeMessage(
  message: SteamBridgeRequest,
  sendResponse: (response: SteamBridgeResponse<DispatchPayload>) => void
) {
  if (message.action === "upload-image") {
    const payload = message as SteamUploadRequest;
    const raw = payload.file?.data;
    const byteLength = Array.isArray(raw)
      ? raw.length
      : raw instanceof ArrayBuffer
        ? raw.byteLength
        : typeof (raw as { byteLength?: number })?.byteLength === "number"
          ? (raw as { byteLength: number }).byteLength
          : null;
    loggers.content.info("接收到上传消息", {
      byteLength,
      name: payload.file?.name
    });
  }

  try {
    switch (message.action) {
      case "ping": {
        sendResponse({ ok: true, data: { ready: true } });
        break;
      }
      case "upload-image": {
        const result = await handleUploadRequest(message);
        sendResponse({ ok: true, data: result });
        break;
      }
      case "fetch-guide-images": {
        const data = await fetchGuideImagePool(message.scope);
        sendResponse({ ok: true, data });
        break;
      }
      case "delete-image": {
        const deleteRequest = message as SteamDeleteImageRequest;
        await deleteGuideImage(deleteRequest.scope, deleteRequest.previewId);
        sendResponse({ ok: true, data: { success: true } });
        break;
      }
      case "fetch-chapter": {
        const { fetchChapterFromSteam } = await import("./chapterSync");
        const fetchRequest = message as SteamFetchChapterRequest;
        const chapter = await fetchChapterFromSteam(fetchRequest.guideId, fetchRequest.sectionId);
        sendResponse({ ok: true, data: chapter });
        break;
      }
      case "save-chapter": {
        const { saveChapterToSteam } = await import("./chapterSync");
        const saveRequest = message as SteamSaveChapterRequest;
        const sectionId = await saveChapterToSteam(
          saveRequest.guideId,
          saveRequest.sectionId,
          saveRequest.title,
          saveRequest.description,
          saveRequest.sessionId  // 传递从 MAIN world 获取的 sessionId
        );
        sendResponse({ ok: true, data: { sectionId } });
        break;
      }
      case "fetch-chapter-list": {
        const { fetchChapterList } = await import("./chapterSync");
        const listRequest = message as SteamFetchChapterListRequest;
        const chapters = await fetchChapterList(listRequest.guideId);
        sendResponse({ ok: true, data: { chapters } });
        break;
      }
      case "fetch-guide-info": {
        const { fetchGuideInfo } = await import("./guideInfo");
        const infoRequest = message as SteamFetchGuideInfoRequest;
        const guideInfo = await fetchGuideInfo(infoRequest.guideId);
        sendResponse({ ok: true, data: guideInfo });
        break;
      }
      default: {
        sendResponse({
          ok: false,
          error: `未知的 Steam 桥接操作: ${message.action ?? "unknown"}`
        });
      }
    }
  } catch (error) {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function handlePageBridgeMessage(event: MessageEvent) {
  if (event.source !== window) {
    return;
  }

  const data = event.data as SteamPageBridgeRequest | SteamPageBridgeResponse | undefined;

  if (!data || data.channel !== "nasge:steam") {
    return;
  }

  if ((data as SteamPageBridgeRequest).direction !== "page->content") {
    return;
  }

  const { direction, ...request } = data as SteamPageBridgeRequest;

  void dispatchSteamBridgeMessage(request, (response) => {
    const envelope: SteamPageBridgeResponse = {
      channel: "nasge:steam",
      direction: "content->page",
      requestId: request.requestId,
      response
    };

    window.postMessage(envelope, window.location.origin);
  });
}
