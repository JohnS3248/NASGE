(() => {
  console.info("[NASGE] Content script injected:", window.location.href);

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
})();
