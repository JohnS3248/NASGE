declare global {
  interface Window {
    __NASGE_REVIEW_CONTENT_INITIALIZED__?: boolean;
  }
}

import type {
  SteamBridgeRequest,
  SteamBridgeResponse,
  SteamWriteReviewTextRequest,
  SteamSubmitReviewRequest,
} from "../shared/messages";
import {
  readReviewForm,
  writeReviewText,
  submitReviewToSteam,
} from "./reviewBridge";

(() => {
  if (window.__NASGE_REVIEW_CONTENT_INITIALIZED__) return;
  window.__NASGE_REVIEW_CONTENT_INITIALIZED__ = true;

  console.info("[NASGE] Review content script injected:", window.location.href);

  chrome.runtime.onMessage.addListener(
    (message: SteamBridgeRequest, _sender, sendResponse) => {
      if (message?.channel !== "nasge:steam") return;
      void dispatchReviewMessage(message, sendResponse);
      return true;
    }
  );

  chrome.runtime.sendMessage(
    { type: "PING_FROM_CONTENT" },
    (response) => {
      if (chrome.runtime.lastError) {
        console.debug(
          "[NASGE] Background ping failed:",
          chrome.runtime.lastError.message
        );
        return;
      }
      console.debug("[NASGE] Background response:", response);
    }
  );
})();

async function dispatchReviewMessage(
  message: SteamBridgeRequest,
  sendResponse: (response: SteamBridgeResponse) => void
) {
  try {
    switch (message.action) {
      case "ping":
        sendResponse({ ok: true, data: { ready: true } });
        break;

      case "fetch-review":
        sendResponse({ ok: true, data: readReviewForm() });
        break;

      case "write-review-text": {
        const writeReq = message as SteamWriteReviewTextRequest;
        writeReviewText(writeReq.text);
        sendResponse({ ok: true, data: { success: true } });
        break;
      }

      case "submit-review": {
        const submitReq = message as SteamSubmitReviewRequest;
        const result = await submitReviewToSteam(submitReq.data);
        sendResponse({ ok: true, data: result });
        break;
      }

      default:
        sendResponse({
          ok: false,
          error: `评测脚本不支持的操作: ${message.action}`,
        });
    }
  } catch (error) {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
