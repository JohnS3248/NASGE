import type {
  SteamUploadRequest,
  SteamGuideImage,
  SteamScreenshotItem,
  UploadContext,
  UploadResult,
  UploadScope
} from "../shared/messages";
import { loggers } from "../shared/logger";
import { SteamBridgeError } from "../shared/steamErrors";

declare global {
  interface Window {
    /** Steam page global — session ID */
    g_sessionID?: string;
  }
}

const UPLOAD_SELECTORS: Record<UploadScope, () => HTMLFormElement | null> = {
  "chapter-preview": () => {
    const candidates = Array.from(
      document.querySelectorAll<HTMLFormElement>('form[action*="ugcupload"]')
    );

    return (
      candidates.find((form) =>
        form.action.includes("ugcupload")
      ) ?? null
    );
  },
  "guide-cover": () =>
    document.querySelector<HTMLFormElement>("#SubmitGuideForm")
};

export async function handleUploadRequest(
  request: SteamUploadRequest
): Promise<UploadResult> {
  const rawData = request.file.data;
  loggers.bridge.info("handleUploadRequest 收到文件数据", {
    name: request.file.name,
    type: request.file.type
  });

  const fileBytes = new Uint8Array(rawData);
  const file = new File([fileBytes], request.file.name, {
    type: request.file.type,
    lastModified: Date.now()
  });

  // 1. 获取 Steam 表单和文件输入控件
  const { form, fileInput } = resolveUploadElements(request.scope);

  if (fileInput.files?.length) {
    fileInput.value = "";
  }

  // 2. 通过 DataTransfer 注入文件
  if (!assignFileToInput(fileInput, file)) {
    throw new Error("未能写入上传文件，请重试。");
  }
  fireUpdateEvents(fileInput);

  // 3. 手动填充 Steam 所需的隐藏字段
  ensureFileSizeFields(form, file.size);
  ensureCloudFilenamePrefix(form);

  const context = extractUploadContext(request.scope, form);

  loggers.bridge.verbose("Steam 上传字段已就绪", {
    action: context.action,
    fileFieldName: context.fileFieldName,
    file_size: context.fields["file_size"] ?? context.fields["file_size[]"],
    cloudfilenameprefix: maskForLog(context.fields["cloudfilenameprefix"])
  });

  // 4. 读取图片尺寸并写入表单
  const dimensions = await readImageDimensions(file);
  ensureDimensionInputs(form, dimensions);

  // 5. 创建 iframe 接收响应，保存/恢复表单属性
  const originalTarget = form.getAttribute("target");
  const originalEnctype = form.enctype;
  const originalMethod = form.method;

  const frame = document.createElement("iframe");
  frame.name = `nasge_upload_${Date.now().toString(36)}`;
  frame.style.display = "none";
  document.body.appendChild(frame);

  form.target = frame.name;
  form.enctype = "multipart/form-data";
  form.method = "POST";

  // 6. 提交表单并等待响应
  return new Promise<UploadResult>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      frame.removeEventListener("load", handleLoad);
      frame.remove();

      if (originalTarget) {
        form.setAttribute("target", originalTarget);
      } else {
        form.removeAttribute("target");
      }
      form.enctype = originalEnctype;
      form.method = originalMethod;

      // 清空文件输入框（浏览器安全限制只能设为空字符串）
      fileInput.value = "";
    };

    const timeout = window.setTimeout(() => {
      if (!settled) {
        cleanup();
        reject(new Error("上传超时，请重试。"));
      }
    }, 20_000);

    function handleLoad() {
      let redirectUrl: string | null = null;
      try {
        redirectUrl = frame.contentWindow?.location.href ?? null;
      } catch {
        return;
      }

      if (!redirectUrl || redirectUrl === "about:blank") {
        return;
      }

      settled = true;
      window.clearTimeout(timeout);
      cleanup();

      try {
        const info = interpretUploadRedirect(redirectUrl);
        resolve({
          redirectUrl,
          previewIds: info.previewIds,
          status: 200
        });
      } catch (error) {
        reject(error);
      }
    }

    frame.addEventListener("load", handleLoad);

    try {
      form.submit();
    } catch (error) {
      window.clearTimeout(timeout);
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function assignFileToInput(input: HTMLInputElement | null, file: File): boolean {
  if (!input) {
    return false;
  }
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  return Boolean(input.files && input.files.length);
}

function maskForLog(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  if (value.length <= 10) {
    return value;
  }
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function interpretUploadRedirect(url: string): { previewIds: string[] } {
  const parsed = new URL(url);
  const successCode = parsed.searchParams.get("fileuploadsuccess") ?? "0";
  const previewIds = parsed.searchParams.getAll("previewid[]").filter(Boolean);
  const errorCode = parsed.searchParams.get("error") ?? parsed.searchParams.get("warning");

  if (successCode !== "1") {
    const code = parseInt(successCode, 10);
    const mappedMessage = mapSteamUploadError(successCode, errorCode);
    throw new SteamBridgeError(mappedMessage, { eresult: isNaN(code) ? undefined : code });
  }

  if (!previewIds.length) {
    throw new Error("Steam 上传成功但未返回 previewid。");
  }

  return { previewIds };
}

export async function fetchGuideImagePool(scope: UploadScope): Promise<SteamGuideImage[]> {
  const isManageGuidePage = window.location.href.includes("/manageguide/");
  const isEditSubsectionPage = window.location.href.includes("/editguidesubsection/");

  // manageguide 页面：使用 gPreviewImages 桥接数据
  // 注意：AJAX API (userfilesforguide) 返回的是用户截图，不是指南图片池
  if (isManageGuidePage) {
    loggers.bridge.info("在 manageguide 页面，从 gPreviewImages 桥接数据读取");
    return parseGuideImagePoolFromDOM();
  }

  if (isEditSubsectionPage) {
    loggers.bridge.info("在 editguidesubsection 页面，从页面 DOM 直接读取图片池");
    return parseGuideImagePoolFromEditSubsectionDOM();
  }

  // 其他页面（如章节编辑页）：尝试 AJAX
  loggers.bridge.info("尝试通过 AJAX 拉取图片池");

  let sessionId: string | undefined;
  let consumerAppId: string | undefined;
  let guideId: string | undefined;

  try {
    const { form } = resolveUploadElements(scope);
    sessionId = readFormField(form, "sessionid");
    consumerAppId = readFormField(form, "consumer_app_id");
    guideId = readFormField(form, "publishedfileid") ?? readFormField(form, "id");
  } catch (error) {
    loggers.bridge.warn("无法从上传表单读取字段，尝试其他方式", error);
  }

  // 从 URL 获取 guideId
  if (!guideId) {
    guideId = new URL(window.location.href).searchParams.get("id") ?? undefined;
  }

  // 从页面中的任意表单查找 sessionid
  if (!sessionId) {
    const allForms = document.querySelectorAll('form');
    for (const form of allForms) {
      const sessionInput = form.querySelector<HTMLInputElement>('input[name="sessionid"]');
      if (sessionInput?.value) {
        sessionId = sessionInput.value;
        loggers.bridge.info("从表单中提取 sessionid");
        break;
      }
    }
  }

  // 从 cookie 中提取 sessionid（Steam 通常会设置）
  if (!sessionId) {
    const match = document.cookie.match(/sessionid=([^;]+)/);
    if (match) {
      sessionId = decodeURIComponent(match[1]);
      loggers.bridge.info("从 cookie 中提取 sessionid");
    }
  }

  if (!consumerAppId) {
    const allForms = document.querySelectorAll('form');
    for (const form of allForms) {
      const appIdInput = form.querySelector<HTMLInputElement>('input[name="consumer_app_id"]');
      if (appIdInput?.value) {
        consumerAppId = appIdInput.value;
        break;
      }
    }
  }

  if (!consumerAppId) {
    const urlMatch = window.location.href.match(/appid[=\/](\d+)/);
    if (urlMatch) {
      consumerAppId = urlMatch[1];
    }
  }

  if (!consumerAppId) {
    const metaTag = document.querySelector<HTMLMetaElement>('meta[name="twitter:app:id:iphone"], meta[property="al:ios:app_store_id"]');
    if (metaTag?.content) {
      consumerAppId = metaTag.content;
    }
  }

  if (!consumerAppId) {
    try {
      const response = await fetch(`https://steamcommunity.com/sharedfiles/filedetails/?id=${guideId}`, {
        method: 'GET',
        credentials: 'include'
      });
      const html = await response.text();
      const appIdMatch = html.match(/consumer_appid["\s:=]+(\d+)/i);
      if (appIdMatch) {
        consumerAppId = appIdMatch[1];
        loggers.bridge.info("从指南详情页提取 appid", consumerAppId);
      }
    } catch (error) {
      loggers.bridge.warn("无法从指南详情页提取 appid", error);
    }
  }

  loggers.bridge.info("收集到的上下文信息", {
    sessionId: sessionId ? "存在" : "缺失",
    consumerAppId,
    guideId
  });

  if (!sessionId || !guideId) {
    throw new Error(`无法收集 Steam 图片池所需的上下文信息。sessionId: ${!!sessionId}, guideId: ${!!guideId}`);
  }

  if (!consumerAppId) {
    loggers.bridge.warn("无法自动获取 consumer_app_id，这可能导致图片池为空");
    consumerAppId = "";
  }

  // 分页加载所有图片
  const allImages: SteamGuideImage[] = [];
  let currentPage = 1;
  const maxPages = 20; // 防止无限循环

  while (currentPage <= maxPages) {
    const params = new URLSearchParams();
    if (consumerAppId) {
      params.set("appid", consumerAppId);
    }
    params.set("sessionid", sessionId);
    params.set("id", guideId);
    params.set("filetype", "4");
    params.set("p", String(currentPage));

    loggers.bridge.info("发起 AJAX 请求", { page: currentPage, params: params.toString() });

    const response = await fetch("https://steamcommunity.com/sharedfiles/userfilesforguide", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest"
      },
      body: params.toString(),
      credentials: "include"
    });

    if (!response.ok) {
      throw new SteamBridgeError(`拉取 Steam 图片池失败：HTTP ${response.status}`, { httpStatus: response.status });
    }

    const html = await response.text();
    loggers.bridge.info("AJAX 响应长度", { page: currentPage, length: html.length });

    const pageImages = parseGuideImagePool(html);
    loggers.bridge.info("本页图片数量", { page: currentPage, count: pageImages.length });

    if (pageImages.length === 0) {
      // 没有更多图片了
      break;
    }

    allImages.push(...pageImages);
    currentPage++;
  }

  loggers.bridge.info("AJAX 加载完成，共", allImages.length, "张图片");
  return allImages;
}

function mapSteamUploadError(successCode: string, errorCode: string | null): string {
  if (successCode === "29") {
    return "Steam 上传失败（重复的图片或使用中的文件）。请确认该图片未在当前指南中占用，或尝试修改文件名后重新上传。";
  }

  if (errorCode) {
    return `Steam 上传失败（错误码 ${errorCode}）。`;
  }

  return `Steam 上传失败，返回代码 ${successCode}。`;
}

function readFormField(form: HTMLFormElement, name: string): string | undefined {
  const input = form.querySelector<HTMLInputElement>(`input[name='${name}']`);
  const value = input?.value?.trim();
  return value ? value : undefined;
}

function parseGuideImagePool(html: string): SteamGuideImage[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const images = new Map<string, SteamGuideImage>();

  const nodes = Array.from(doc.querySelectorAll<HTMLElement>("[data-previewid], img"));
  for (const node of nodes) {
    let previewId: string | undefined;
    let thumbnailUrl: string | undefined;
    let fileName: string | undefined;

    if (node instanceof HTMLImageElement) {
      const src = node.getAttribute("src") ?? "";
      const match = /UGC\/(\d+)/i.exec(src);
      if (match) {
        previewId = match[1];
        thumbnailUrl = absoluteUrl(src);
      }
      fileName =
        node.getAttribute("data-filename") ??
        node.getAttribute("data-title") ??
        node.getAttribute("title") ??
        node.getAttribute("alt") ??
        fileName;
    }

    if (!previewId) {
      const attr = node.getAttribute("data-previewid");
      if (attr) {
        previewId = attr;
      }
      const thumbAttr = node.getAttribute("data-thumbnail-url");
      if (thumbAttr) {
        thumbnailUrl = absoluteUrl(thumbAttr);
      }
      const nameAttr = node.getAttribute("data-filename") ?? node.getAttribute("data-title");
      if (nameAttr) {
        fileName = nameAttr;
      }
    }

    if (!previewId && node instanceof HTMLElement) {
      const onclick = node.getAttribute("onclick") ?? "";
      const match = /SelectItem[^]*?(['"])(\d+)\1/.exec(onclick) ?? /previewid=(\d+)/.exec(onclick);
      if (match) {
        previewId = match[2] ?? match[1];
      }
    }

    if (!previewId) {
      continue;
    }

    if (!thumbnailUrl && node instanceof HTMLImageElement) {
      const src = node.getAttribute("src") ?? "";
      thumbnailUrl = absoluteUrl(src);
    }

    if (!fileName) {
      const label = node.getAttribute("data-filename") ?? node.textContent ?? "";
      fileName = label.trim() || `preview_${previewId}`;
    }

    const record: SteamGuideImage = {
      previewId,
      fileName,
      thumbnailUrl,
      originalUrl: deriveOriginalUrl(thumbnailUrl)  // 从缩略图 URL 派生全尺寸 URL
    };

    if (!images.has(previewId)) {
      images.set(previewId, record);
    }
  }

  return Array.from(images.values());
}

function absoluteUrl(src: string): string | undefined {
  if (!src) return undefined;
  try {
    return new URL(src, window.location.href).toString();
  } catch {
    return src;
  }
}

/**
 * 从缩略图 URL 派生全尺寸原图 URL
 * Steam CDN 规律：缩略图带 ?imw=256&... 参数，去掉即为原图
 */
function deriveOriginalUrl(thumbnailUrl: string | undefined): string | undefined {
  if (!thumbnailUrl) return undefined;
  try {
    const url = new URL(thumbnailUrl);
    url.search = '';
    return url.toString();
  } catch {
    return thumbnailUrl;
  }
}

async function parseGuideImagePoolFromDOM(): Promise<SteamGuideImage[]> {
  const images = new Map<string, SteamGuideImage>();

  // 从页面桥接脚本写入的 DOM 属性读取 gPreviewImages
  // Content script 运行在隔离环境，无法直接访问页面的全局变量
  // 使用 postMessage 请求 MAIN world 脚本刷新数据
  let globalVar: any = null;

  try {
    // 通过 postMessage 请求 MAIN world 刷新数据
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        loggers.bridge.warn('刷新请求超时，使用现有数据');
        resolve();
      }, 500);

      const handler = (event: MessageEvent) => {
        if (event.source !== window) return;
        if (event.data?.channel !== 'nasge:gpreview' || event.data?.action !== 'refreshed') return;

        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        resolve();
      };

      window.addEventListener('message', handler);
      window.postMessage({ channel: 'nasge:gpreview', action: 'refresh' }, window.location.origin);
    });

    // 读取刷新后的数据
    const attr = document.documentElement.getAttribute('data-nasge-gpreview-bridge');
    if (attr && attr !== 'null') {
      globalVar = JSON.parse(attr);
    } else {
      loggers.bridge.warn('gPreviewImages 不存在或为空');
    }
  } catch (error) {
    loggers.bridge.error('读取页面桥接数据失败:', error);
  }

  if (Array.isArray(globalVar) && globalVar.length > 0) {
    loggers.bridge.info('从全局变量 gPreviewImages 解析图片池');

    for (const item of globalVar) {
      if (item.previewid) {
        const imageData = {
          previewId: item.previewid,
          fileName: item.filename || `preview_${item.previewid}`,
          thumbnailUrl: item.url,
          originalUrl: item.url  // 完整的透明背景 URL
        };

        images.set(item.previewid, imageData);
      }
    }

    // 成功使用 gPreviewImages，直接返回
    loggers.bridge.info(`从 gPreviewImages 解析到 ${images.size} 张图片`);
    return Array.from(images.values());
  }

  // Fallback: 从 DOM 解析
  loggers.bridge.warn('gPreviewImages 不可用，尝试从 DOM 解析');

  const imageContainers = document.querySelectorAll('.manageSortablePreview, .guide_preview_image_small, .preview_image, [data-previewid]');

  for (const container of Array.from(imageContainers)) {
    let previewId: string | undefined;
    let thumbnailUrl: string | undefined;
    let fileName: string | undefined;

    const idMatch = /preview_(\d+)/.exec(container.id || '');
    if (idMatch) {
      previewId = idMatch[1];
    }

    const dataPreviewId = container.getAttribute('data-previewid');
    if (dataPreviewId && !previewId) {
      previewId = dataPreviewId;
    }

    const img = container.querySelector('img') || (container instanceof HTMLImageElement ? container : null);
    if (img) {
      const src = img.getAttribute('src') || '';
      const match = /UGC\/(\d+)|ugc\/(\d+)/i.exec(src);
      if (match && !previewId) {
        previewId = match[1] || match[2];
      }
      if (src) {
        thumbnailUrl = absoluteUrl(src);
      }
      fileName = img.getAttribute('alt') || img.getAttribute('title') || fileName;
    }

    const onclick = container.getAttribute('onclick') || '';
    if (!previewId) {
      const match = /previewid[=\s]+['"]?(\d+)['"]?/i.exec(onclick) || /preview_(\d+)/i.exec(onclick);
      if (match) {
        previewId = match[1];
      }
    }

    if (!fileName) {
      const titleElem = container.querySelector('.preview_title, .file_name');
      if (titleElem) {
        fileName = titleElem.textContent?.trim() || fileName;
      }
    }

    if (previewId) {
      if (!fileName) {
        fileName = `preview_${previewId}`;
      }
      if (!images.has(previewId)) {
        images.set(previewId, {
          previewId,
          fileName,
          thumbnailUrl,
          originalUrl: deriveOriginalUrl(thumbnailUrl)  // 从缩略图 URL 派生全尺寸 URL
        });
      }
    }
  }

  // 最后尝试从页面桥接合并透明背景URL（如果之前走了DOM fallback）
  let globalVarFinal: any = null;
  try {
    // 尝试从页面桥接读取
    let attr = document.documentElement.getAttribute('data-nasge-gpreview-bridge');

    if (!attr || attr === 'null') {
      // 如果没有，手动触发一次
      const script = document.createElement('script');
      script.textContent = `
        (function() {
          if (typeof window.gPreviewImages !== 'undefined' && window.gPreviewImages) {
            document.documentElement.setAttribute('data-nasge-gpreview-bridge', JSON.stringify(window.gPreviewImages));
          }
        })();
      `;
      (document.head || document.documentElement).appendChild(script);
      script.remove();

      attr = document.documentElement.getAttribute('data-nasge-gpreview-bridge');
    }

    if (attr && attr !== 'null') {
      globalVarFinal = JSON.parse(attr);
    }
  } catch (error) {
    loggers.bridge.warn('最终检查失败:', error);
  }

  if (Array.isArray(globalVarFinal) && globalVarFinal.length > 0) {
    loggers.bridge.verbose('最终检查：发现 gPreviewImages，合并透明URL');
    for (const item of globalVarFinal) {
      if (item.previewid && item.url) {
        const existing = images.get(item.previewid);
        if (existing) {
          existing.originalUrl = item.url;  // 使用透明背景URL覆盖
          existing.fileName = item.filename || existing.fileName;
        } else {
          // 如果DOM中没有找到，直接添加
          images.set(item.previewid, {
            previewId: item.previewid,
            fileName: item.filename || `preview_${item.previewid}`,
            thumbnailUrl: item.url,
            originalUrl: item.url
          });
        }
      }
    }
  }

  loggers.bridge.info(`从 DOM 解析到 ${images.size} 张图片`);
  return Array.from(images.values());
}

function parseGuideImagePoolFromEditSubsectionDOM(): SteamGuideImage[] {
  const images = new Map<string, SteamGuideImage>();

  const previewImagesContainer = document.querySelector('#PreviewImages');
  if (!previewImagesContainer) {
    loggers.bridge.warn('未找到 #PreviewImages 容器');
    return [];
  }

  const imageElements = previewImagesContainer.querySelectorAll('img[id][src*="steamusercontent"]');
  loggers.bridge.info(`在 #PreviewImages 中找到 ${imageElements.length} 张图片`);

  for (const img of Array.from(imageElements)) {
    const previewId = img.id;
    const thumbnailUrl = img.getAttribute('src');
    const fileName = img.getAttribute('title') || `preview_${previewId}`;

    if (previewId && thumbnailUrl) {
      const absoluteThumbnailUrl = absoluteUrl(thumbnailUrl);
      images.set(previewId, {
        previewId,
        fileName,
        thumbnailUrl: absoluteThumbnailUrl,
        originalUrl: deriveOriginalUrl(absoluteThumbnailUrl)  // 从缩略图 URL 派生全尺寸 URL
      });
    }
  }

  loggers.bridge.info(`从 editguidesubsection DOM 解析到 ${images.size} 张图片`, Array.from(images.values()));
  return Array.from(images.values());
}

export async function deleteGuideImage(scope: UploadScope, previewId: string): Promise<void> {
  loggers.bridge.info("准备删除图片", { scope, previewId });

  let sessionId: string | undefined;
  let guideId: string | undefined;

  try {
    const { form } = resolveUploadElements(scope);
    sessionId = readFormField(form, "sessionid");
    guideId = readFormField(form, "id") ?? readFormField(form, "publishedfileid");
  } catch (error) {
    loggers.bridge.warn("无法从表单读取删除参数，尝试其他方式", error);
  }

  if (!sessionId) {
    sessionId = window.g_sessionID;
  }

  if (!guideId) {
    guideId = new URL(window.location.href).searchParams.get("id") ?? undefined;
  }

  if (!sessionId || !guideId) {
    loggers.bridge.error("删除图片失败：缺少必要参数", { sessionId: !!sessionId, guideId });
    throw new Error("无法收集删除图片所需的上下文信息（sessionid/id）。");
  }

  const params = new URLSearchParams();
  params.set("id", guideId);
  params.set("sessionid", sessionId);
  params.set("previewid", previewId);
  params.set("ajax", "true");

  loggers.bridge.info("发送删除请求", {
    url: "https://steamcommunity.com/sharedfiles/removepreview",
    params: params.toString()
  });

  const response = await fetch("https://steamcommunity.com/sharedfiles/removepreview", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "X-Prototype-Version": "1.7"
    },
    body: params.toString(),
    credentials: "include"
  });

  if (!response.ok) {
    loggers.bridge.error("删除请求失败", { status: response.status, statusText: response.statusText });
    throw new SteamBridgeError(`删除图片失败：HTTP ${response.status}`, { httpStatus: response.status });
  }

  const result = await response.json();
  loggers.bridge.info("删除请求响应", result);

  if (result.success !== 1) {
    throw new SteamBridgeError("Steam 删除图片失败，请刷新页面后重试。", { eresult: result.success });
  }

  loggers.bridge.info("成功删除图片，开始清理 DOM", previewId);

  const isEditSubsectionPage = window.location.href.includes("/editguidesubsection/");
  if (isEditSubsectionPage) {
    const imgElement = document.querySelector(`#PreviewImages img[id="${previewId}"]`);
    if (imgElement) {
      const container = imgElement.closest('.previewImage, div[class*="preview"]');
      if (container) {
        container.remove();
        loggers.bridge.info("已从 DOM 中移除图片容器", previewId);
      } else {
        imgElement.remove();
        loggers.bridge.info("已从 DOM 中移除图片元素", previewId);
      }
    } else {
      loggers.bridge.warn("未在 DOM 中找到要移除的图片", previewId);
    }
  }

  loggers.bridge.info("图片删除完成", previewId);
}

function resolveUploadElements(scope: UploadScope): {
  form: HTMLFormElement;
  fileInput: HTMLInputElement;
} {
  const finder = UPLOAD_SELECTORS[scope];
  const form = finder?.() ?? null;

  if (!form) {
    throw new Error("未能在当前页面找到 Steam 上传表单，请确认页面位置是否正确。");
  }

  const fileInput = form.querySelector<HTMLInputElement>("input[type='file'][name]");
  if (!fileInput) {
    throw new Error("Steam 上传表单缺少文件选择控件。");
  }

  return { form, fileInput };
}

async function readImageDimensions(file: File): Promise<{
  width: number;
  height: number;
}> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      const { width, height } = bitmap;
      bitmap.close();
      return { width, height };
    } catch {
      // ignore and fallback to HTMLImageElement approach
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = (error) => reject(error);
      img.src = url;
    });
    return dimensions;
  } catch {
    return { width: 0, height: 0 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function fireUpdateEvents(input: HTMLInputElement): void {
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function ensureDimensionInputs(
  form: HTMLFormElement,
  dimensions: { width: number; height: number }
): void {
  const widthInput = ensureHiddenInput(form, "image_width");
  const heightInput = ensureHiddenInput(form, "image_height");
  widthInput.value = String(dimensions.width ?? 0);
  heightInput.value = String(dimensions.height ?? 0);
}

function ensureHiddenInput(form: HTMLFormElement, name: string): HTMLInputElement {
  let input = form.querySelector<HTMLInputElement>(`input[name='${name}']`);
  if (!input) {
    input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    form.appendChild(input);
  }
  return input;
}

function ensureFileSizeFields(form: HTMLFormElement, size: number): void {
  const value = String(size);
  let updated = false;
  for (const name of ["file_size", "file_size[]", "filesize"]) {
    const input = form.querySelector<HTMLInputElement>(`input[name='${name}']`);
    if (input) {
      input.value = value;
      updated = true;
    }
  }

  if (!updated) {
    const fallback = ensureHiddenInput(form, "file_size");
    fallback.value = value;
  }
}

function ensureCloudFilenamePrefix(form: HTMLFormElement): string {
  const candidates = [
    form.querySelector<HTMLInputElement>("input[name='cloudfilenameprefix']"),
    form.querySelector<HTMLInputElement>("input[name='cloudfilenameprefix[]']")
  ];

  let target = candidates.find(Boolean) ?? null;
  if (!target) {
    target = ensureHiddenInput(form, "cloudfilenameprefix");
  }

  if (!target.value) {
    target.value = generateCloudFilenamePrefix();
  }

  return target.value;
}

function generateCloudFilenamePrefix(): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const random = Math.random().toString(36).slice(2, 10);
  return `${timestamp}_nasge_${random}`;
}

function extractUploadContext(scope: UploadScope, explicitForm?: HTMLFormElement): UploadContext {
  const finder = UPLOAD_SELECTORS[scope];
  const form = explicitForm ?? finder?.() ?? null;

  if (!form) {
    throw new Error("未能在当前页面找到 Steam 上传表单，请确认页面位置是否正确。");
  }

  const fileInput = form.querySelector<HTMLInputElement>("input[type='file'][name]");

  const formData = new FormData(form);
  const fields: Record<string, string> = {};

  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      fields[key] = value;
    }
  }

  if (!form.action) {
    throw new Error("Steam 上传表单缺少 action 属性。");
  }

  return {
    action: form.action,
    fields,
    fileFieldName: fileInput?.name || "file",
    fileInputMultiple: Boolean(fileInput?.multiple)
  };
}

// === 截图库拉取 ===

/**
 * 解析 sessionid — 多级 fallback
 * 复用现有的 sessionid 获取逻辑,抽取为独立函数
 */
function resolveSessionId(): string | undefined {
  // 1. 从表单隐藏域
  const allForms = document.querySelectorAll('form');
  for (const form of allForms) {
    const input = form.querySelector<HTMLInputElement>('input[name="sessionid"]');
    if (input?.value?.trim()) {
      return input.value.trim();
    }
  }

  // 2. 从 cookie
  const match = document.cookie.match(/sessionid=([^;]+)/);
  if (match) {
    return decodeURIComponent(match[1]);
  }

  // 3. 从全局变量(content script 在 ISOLATED world, 需要通过 MAIN world 桥接)
  return window.g_sessionID;
}

/**
 * 解析 consumer_app_id — 多级 fallback
 * 截图 API 需要 appid 来按游戏过滤
 */
async function resolveConsumerAppId(): Promise<string | undefined> {
  // 1. 从表单隐藏域(editguidesubsection 页面有 consumer_app_id)
  const allForms = document.querySelectorAll('form');
  for (const form of allForms) {
    const input = form.querySelector<HTMLInputElement>('input[name="consumer_app_id"]');
    if (input?.value?.trim()) {
      return input.value.trim();
    }
  }

  // 2. 从 URL
  const urlMatch = window.location.href.match(/appid[=/](\d+)/);
  if (urlMatch) {
    return urlMatch[1];
  }

  // 3. 从 meta
  const metaTag = document.querySelector<HTMLMetaElement>(
    'meta[name="twitter:app:id:iphone"], meta[property="al:ios:app_store_id"]'
  );
  if (metaTag?.content) {
    return metaTag.content;
  }

  // 4. 从 editguidesubsection 页面提取(manageguide 页面没有 consumer_app_id)
  //    Steam 后端把 appid 硬编码在 GetMoreScreenshots 函数体中,只有章节编辑页有
  const guideId = new URL(window.location.href).searchParams.get("id");
  if (guideId) {
    // 找到任意一个 sectionId 来构造 editguidesubsection URL
    let sectionId: string | undefined;
    const sectionInput = document.querySelector<HTMLInputElement>('input[name*="sub_sections"]');
    if (sectionInput) {
      const m = sectionInput.name.match(/\[(\d+)\]/);
      if (m) sectionId = m[1];
    }

    if (sectionId) {
      try {
        const response = await fetch(
          `https://steamcommunity.com/sharedfiles/editguidesubsection/?id=${guideId}&sectionid=${sectionId}`,
          { method: "GET", credentials: "include" }
        );
        const html = await response.text();
        // Steam 把 appid 硬编码在 GetMoreScreenshots 中: 'appid=' + 2129530 + '&...'
        const appIdMatch = html.match(/appid='\s*\+\s*(\d+)/);
        if (appIdMatch) {
          loggers.bridge.info("从 editguidesubsection 提取 appid", appIdMatch[1]);
          return appIdMatch[1];
        }
      } catch (error) {
        loggers.bridge.warn("从 editguidesubsection 提取 appid 失败", error);
      }
    }
  }

  return undefined;
}

/**
 * 从 Steam 拉取当前游戏的截图列表
 *
 * API: POST https://steamcommunity.com/sharedfiles/userfilesforguide
 * 参数: appid + sessionid + p(页码) + filetype=4
 * 注意: 不传 id(指南 ID),这样返回的是该用户在该游戏的所有截图
 *
 * @param page 页码,从 1 开始,默认拉取全部页
 */
export async function fetchScreenshots(page?: number): Promise<SteamScreenshotItem[]> {
  const sessionId = resolveSessionId();
  if (!sessionId) {
    throw new Error("无法获取 Steam sessionid,请确认已登录 Steam");
  }

  const appId = await resolveConsumerAppId();
  if (!appId) {
    throw new Error("无法获取当前指南绑定的游戏 appid");
  }

  loggers.bridge.info("开始拉取游戏截图", { appId, page: page ?? "all" });

  const allScreenshots: SteamScreenshotItem[] = [];
  let currentPage = page ?? 1;
  const maxPages = page ? page : 20; // 指定页码时只拉一页,否则拉全部

  while (currentPage <= maxPages) {
    const params = new URLSearchParams();
    params.set("appid", appId);
    params.set("sessionid", sessionId);
    params.set("p", String(currentPage));
    params.set("filetype", "4");

    const response = await fetch("https://steamcommunity.com/sharedfiles/userfilesforguide", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest"
      },
      body: params.toString(),
      credentials: "include"
    });

    if (!response.ok) {
      throw new SteamBridgeError(`拉取截图列表失败: HTTP ${response.status}`, { httpStatus: response.status });
    }

    const json = await response.json() as {
      success: number;
      publishedfiledetails?: Record<string, {
        publishedfileid: string;
        image_url: string;
        preview_url: string;
        filename: string;
        short_description: string;
        image_width: number;
        image_height: number;
        file_size: string;
        time_created: number;
      }>;
    };

    if (json.success !== 1) {
      throw new SteamBridgeError(`Steam API 返回失败: success=${json.success}`, { eresult: json.success });
    }

    const details = json.publishedfiledetails;
    if (!details || Object.keys(details).length === 0) {
      break; // 没有更多截图
    }

    for (const item of Object.values(details)) {
      allScreenshots.push({
        publishedfileid: item.publishedfileid,
        imageUrl: item.image_url,
        previewUrl: item.preview_url,
        filename: item.filename,
        description: item.short_description || "",
        width: item.image_width,
        height: item.image_height,
        fileSize: parseInt(item.file_size, 10) || 0,
        timeCreated: item.time_created
      });
    }

    loggers.bridge.info("截图页加载完成", {
      page: currentPage,
      count: Object.keys(details).length,
      total: allScreenshots.length
    });

    if (page) break; // 指定页码时只拉一页
    currentPage++;
  }

  loggers.bridge.info("截图拉取完成", { total: allScreenshots.length });
  return allScreenshots;
}
