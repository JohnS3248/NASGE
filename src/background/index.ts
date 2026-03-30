import { loggers, setDebugMode } from "../shared/logger";

// Background 无 EditorConfigStore，开发阶段始终开启日志
setDebugMode(false);

chrome.runtime.onInstalled.addListener((details) => {
  loggers.background.info(
    "Background worker installed:",
    JSON.stringify(details, null, 2)
  );
});

import type {
  SteamBridgeRequest,
  SteamBridgeResponse,
  SteamUploadRequest
} from "../shared/messages";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.channel === "nasge:steam" && message?.action === "upload-image") {
    const payloadShape = message?.file?.data;
    const size = Array.isArray(payloadShape)
      ? payloadShape.length
      : payloadShape instanceof ArrayBuffer
        ? payloadShape.byteLength
        : typeof (payloadShape as { byteLength?: number })?.byteLength === "number"
          ? (payloadShape as { byteLength: number }).byteLength
          : null;
    loggers.background.info("收到上传消息", {
      fromTab: sender.tab?.id,
      hasFile: Boolean(message?.file),
      byteLength: size,
      dataType: typeof payloadShape,
      constructor: payloadShape?.constructor?.name,
      hasSlice: typeof (payloadShape as { slice?: unknown })?.slice === "function",
      hasBuffer: payloadShape instanceof ArrayBuffer,
      length: Array.isArray(payloadShape)
        ? payloadShape.length
        : (payloadShape as { length?: number })?.length ?? null,
      byteLengthProp: (payloadShape as { byteLength?: unknown })?.byteLength ?? null,
      keys:
        payloadShape && typeof payloadShape === "object"
          ? Object.keys(payloadShape as Record<string, unknown>).slice(0, 5)
          : undefined
    });
  }

  if (message?.type === "PING_FROM_CONTENT") {
    loggers.background.info("Received ping from content script", sender.tab?.url);
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
    const targetTabId = await resolveTargetTabId(sender, message.action);

    if (!targetTabId) {
      const isReview = REVIEW_ACTIONS.has(message.action);
      sendResponse({
        ok: false,
        error: isReview
          ? "未找到已打开的 Steam 商店页面，请先在浏览器中打开游戏商店页。"
          : "未找到已打开的 Steam 页面，请先在浏览器中进入 Steam 指南编辑界面。"
      });
      return;
    }

    const forwarded = cloneSteamBridgeRequest(message);
    const response = await dispatchToSteamTab(targetTabId, forwarded);
    sendResponse(response);
  } catch (error) {
    loggers.background.error("Steam bridge error:", error);
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function resolveTargetTabId(
  sender: chrome.runtime.MessageSender,
  action?: string
): Promise<number | undefined> {
  if (sender.tab?.id !== undefined) {
    const url = sender.tab.url ?? "";
    if (isSteamUrl(url)) {
      return sender.tab.id;
    }
  }

  const target = await findSteamTab(action);
  return target?.id;
}

async function dispatchToSteamTab(
  tabId: number,
  message: SteamBridgeRequest,
  attempt = 1
): Promise<SteamBridgeResponse> {
  if (message?.channel === "nasge:steam" && (message as SteamUploadRequest)?.action === "upload-image") {
    const payload = message as SteamUploadRequest;
    const raw = payload.file?.data;
    const byteLength = Array.isArray(raw)
      ? raw.length
      : raw instanceof ArrayBuffer
        ? raw.byteLength
        : typeof (raw as { byteLength?: number })?.byteLength === "number"
          ? (raw as { byteLength: number }).byteLength
          : null;
    loggers.background.info("转发上传消息到 Steam Tab", {
      tabId,
      byteLength,
      attempt
    });
  }

  try {
    return await new Promise<SteamBridgeResponse>((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response as SteamBridgeResponse);
      });
    });
  } catch (error) {
    if (attempt === 1 && needsContentInjection(error)) {
      await injectSteamContentScript(tabId);
      return dispatchToSteamTab(tabId, message, attempt + 1);
    }
    throw error;
  }
}

function needsContentInjection(error: unknown): boolean {
  if (!(error instanceof Error) || !error.message) {
    return false;
  }
  return (
    error.message.includes("Could not establish connection") ||
    error.message.includes("Receiving end does not exist")
  );
}

async function injectSteamContentScript(tabId: number): Promise<void> {
  const scripts = getContentScriptFiles();
  if (!scripts.length) {
    throw new Error("扩展内容脚本缺失，无法注入 Steam 页面。");
  }

  loggers.background.info("Attempting to inject Steam content script on demand", {
    tabId,
    scripts
  });

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: scripts
    });
  } catch (error) {
    loggers.background.error("Failed to inject content script:", error);
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Cannot access contents of the page")) {
      throw new Error(
        "扩展尚未获得访问 Steam 网页的权限，请在浏览器地址栏右侧点击 NASGE 图标，选择“在 steamcommunity.com 上始终允许”后重试。"
      );
    }
    throw error instanceof Error ? error : new Error(message);
  }
}

function getContentScriptFiles(): string[] {
  const manifest = chrome.runtime.getManifest();
  const entries = manifest.content_scripts ?? [];
  const scripts: string[] = [];
  for (const entry of entries) {
    if (Array.isArray(entry.js)) {
      scripts.push(...entry.js);
    }
  }
  return scripts;
}

function isSteamUrl(url: string): boolean {
  return /^https?:\/\/(steamcommunity\.com|store\.steampowered\.com)\//i.test(url);
}

function cloneSteamBridgeRequest(message: SteamBridgeRequest): SteamBridgeRequest {
  if ((message as SteamUploadRequest)?.action !== "upload-image") {
    return message;
  }

  const upload = message as SteamUploadRequest;
  const raw = upload.file.data;

  let clonedData: number[];
  if (Array.isArray(raw)) {
    clonedData = raw.slice();
  } else if (raw instanceof ArrayBuffer) {
    clonedData = Array.from(new Uint8Array(raw));
  } else if (ArrayBuffer.isView(raw)) {
    const view = raw as ArrayBufferView;
    clonedData = Array.from(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  } else if (raw && typeof raw === "object" && "length" in (raw as { length: number })) {
    clonedData = Array.from(raw as ArrayLike<number>);
  } else {
    loggers.background.warn("无法识别上传数据形态，使用空数组", {
      type: describeRawType(raw),
      keys: describeRawKeys(raw)
    });
    clonedData = [];
  }

  loggers.background.info("克隆上传数据", {
    originalType: describeRawType(raw),
    originalLength: describeRawLength(raw),
    clonedLength: clonedData.length
  });

  return {
    ...upload,
    file: {
      ...upload.file,
      data: clonedData
    }
  };
}

function describeRawType(raw: ArrayBuffer | number[] | ArrayLike<number> | undefined): string {
  if (raw instanceof ArrayBuffer) {
    return "ArrayBuffer";
  }
  if (Array.isArray(raw)) {
    return "Array";
  }
  if (ArrayBuffer.isView(raw)) {
    return raw.constructor?.name ?? "TypedArray";
  }
  if (raw && typeof raw === "object" && "constructor" in raw) {
    return ((raw as { constructor?: { name?: string } }).constructor?.name) ?? typeof raw;
  }
  return typeof raw;
}

function describeRawLength(raw: ArrayBuffer | number[] | ArrayLike<number> | undefined): number | null {
  if (raw instanceof ArrayBuffer) {
    return raw.byteLength;
  }
  if (Array.isArray(raw)) {
    return raw.length;
  }
  if (ArrayBuffer.isView(raw)) {
    return (raw as ArrayBufferView).byteLength;
  }
  if (raw && typeof raw === "object" && "length" in raw) {
    const length = (raw as { length: number }).length;
    return typeof length === "number" ? length : null;
  }
  return null;
}

function describeRawKeys(raw: ArrayBuffer | number[] | ArrayLike<number> | undefined): string[] | undefined {
  if (Array.isArray(raw) || raw instanceof ArrayBuffer || ArrayBuffer.isView(raw)) {
    return undefined;
  }
  if (raw && typeof raw === "object") {
    try {
      return Object.keys(raw as unknown as Record<string, unknown>).slice(0, 5);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

const REVIEW_ACTIONS = new Set([
  "fetch-review",
  "write-review-text",
  "submit-review",
]);

async function findSteamTab(action?: string): Promise<chrome.tabs.Tab | undefined> {
  // 评测 action → 只找 store.steampowered.com
  // 其他 action → 只找 steamcommunity.com
  const urls =
    action && REVIEW_ACTIONS.has(action)
      ? ["https://store.steampowered.com/*"]
      : ["https://steamcommunity.com/*", "http://steamcommunity.com/*"];

  const tabs = await chrome.tabs.query({ url: urls });
  if (tabs.length) {
    // 优先选择指南编辑相关页面（manageguide / editguidesubsection）
    const guideTab = tabs.find((t) =>
      t.url?.includes("/manageguide/") || t.url?.includes("/editguidesubsection/")
    );
    return guideTab ?? tabs[0];
  }

  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  return active && isSteamUrl(active.url ?? "") ? active : undefined;
}
