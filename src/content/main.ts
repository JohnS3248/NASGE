import type {
  SteamBridgeRequest,
  SteamBridgeResponse,
  SteamPageBridgeRequest,
  SteamPageBridgeResponse,
  UploadResult
} from "../shared/messages";
import { handleUploadRequest } from "./steamBridge";

(() => {
  console.info("[NASGE] Content script injected:", window.location.href);

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
      console.debug(
        "[NASGE] Background ping failed:",
        chrome.runtime.lastError.message
      );
      return;
    }

    console.debug("[NASGE] Background response:", response);
  });

  window.addEventListener("message", handlePageBridgeMessage);
})();

type DispatchPayload = UploadResult | { ready: boolean };

async function dispatchSteamBridgeMessage(
  message: SteamBridgeRequest,
  sendResponse: (response: SteamBridgeResponse<DispatchPayload>) => void
) {
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
      case "collect-upload-context": {
        // 暂未开放单独的上下文采集接口，如有需要可在后续迭代补充。
        sendResponse({
          ok: false,
          error: "暂未实现 collect-upload-context 操作。"
        });
        break;
      }
      default: {
        sendResponse({
          ok: false,
          error: `未知的 Steam 桥接操作: ${(message as any)?.action ?? "unknown"}`
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
