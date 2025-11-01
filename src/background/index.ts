chrome.runtime.onInstalled.addListener((details) => {
  console.info(
    `[NASGE] Background worker installed:`,
    JSON.stringify(details, null, 2)
  );
});

import type {
  SteamBridgeRequest,
  SteamBridgeResponse
} from "../shared/messages";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "PING_FROM_CONTENT") {
    console.info("[NASGE] Received ping from content script", sender.tab?.url);
    sendResponse({ ok: true, receivedAt: Date.now() });
    return true;
  }

  if (message?.channel === "nasge:steam") {
    void handleSteamBridgeMessage(message as SteamBridgeRequest, sender, sendResponse);
    return true;
  }

  return false;
});

async function handleSteamBridgeMessage(
  message: SteamBridgeRequest,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: SteamBridgeResponse) => void
) {
  try {
    const targetTabId = await resolveTargetTabId(sender);

    if (!targetTabId) {
      sendResponse({
        ok: false,
        error:
          "未找到已打开的 Steam 页面，请先在浏览器中进入 Steam 指南编辑界面。"
      });
      return;
    }

    chrome.tabs.sendMessage(targetTabId, message, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({
          ok: false,
          error: chrome.runtime.lastError.message ?? "Steam 内容脚本未响应。"
        });
        return;
      }

      sendResponse(response as SteamBridgeResponse);
    });
  } catch (error) {
    console.error("[NASGE] Steam bridge error:", error);
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function resolveTargetTabId(
  sender: chrome.runtime.MessageSender
): Promise<number | undefined> {
  if (sender.tab?.id !== undefined) {
    return sender.tab.id;
  }

  const target = await findSteamTab();
  return target?.id;
}

async function findSteamTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({
    url: ["https://steamcommunity.com/*", "http://steamcommunity.com/*"]
  });

  if (tabs.length) {
    return tabs[0];
  }

  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  return active && active.url?.includes("steamcommunity.com") ? active : undefined;
}
