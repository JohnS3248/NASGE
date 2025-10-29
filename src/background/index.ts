chrome.runtime.onInstalled.addListener((details) => {
  console.info(
    `[NASGE] Background worker installed:`,
    JSON.stringify(details, null, 2)
  );
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "PING_FROM_CONTENT") {
    console.info("[NASGE] Received ping from content script", sender.tab?.url);
    sendResponse({ ok: true, receivedAt: Date.now() });
  }

  return true;
});
