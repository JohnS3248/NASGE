import type {
  SteamUploadRequest,
  SteamGuideImage,
  UploadContext,
  UploadResult,
  UploadScope
} from "../shared/messages";

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
  const byteLength = Array.isArray(rawData)
    ? rawData.length
    : typeof rawData?.byteLength === "number"
      ? rawData.byteLength
      : null;

  console.info("[NASGE][Content] handleUploadRequest 收到文件数据", {
    name: request.file.name,
    byteLength,
    type: request.file.type
  });

  const fileBytes = new Uint8Array(rawData);
  const file = new File([fileBytes], request.file.name, {
    type: request.file.type,
    lastModified: Date.now()
  });

  console.debug("[NASGE] 上传桥接：创建文件对象", {
    name: file.name,
    size: file.size,
    type: file.type
  });

  const { form: initialForm, fileInput: initialFileInput } = resolveUploadElements(request.scope);
  const managedInputs = new Map<HTMLInputElement, string>();

  registerInput(initialFileInput, managedInputs);

  attachDebugListener(initialFileInput);

  if (initialFileInput.files && initialFileInput.files.length) {
    initialFileInput.value = "";
  }

  if (!assignFileToInput(initialFileInput, file)) {
    throw new Error("未能写入上传文件，请重试。");
  }
  fireUpdateEvents(initialFileInput);

  let preparation =
    await waitForSteamPreparation(
      request.scope,
      initialForm,
      initialFileInput,
      file,
      managedInputs
    );

  if (!preparation) {
    console.info("[NASGE] Steam 自动准备未在时限内完成，改用手动补齐流程。");
    preparation = manualPrepareUpload(request.scope, file, managedInputs);
  }

  const { context, form: activeForm, fileInput: activeFileInput } = preparation;
  const { action, fields, fileFieldName } = context;

  console.debug("[NASGE] Steam 准备完成字段", {
    action,
    fileFieldName,
    file_size: fields["file_size"] ?? fields["file_size[]"] ?? fields["filesize"],
    cloudfilenameprefix: maskForLog(fields["cloudfilenameprefix"]),
    token: maskForLog(fields["token"])
  });

  const originalTarget = activeForm.getAttribute("target");
  const originalEnctype = activeForm.enctype;
  const originalMethod = activeForm.method;

  const dimensions = await readImageDimensions(file);

  const frame = createUploadFrame();

  activeForm.target = frame.name;
  activeForm.enctype = "multipart/form-data";
  activeForm.method = "POST";

  ensureDimensionInputs(activeForm, dimensions);

  return new Promise<UploadResult>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      frame.removeEventListener("load", handleLoad);
      if (frame.dataset.nasgeManaged === "true") {
        frame.remove();
      }

      if (originalTarget) {
        activeForm.setAttribute("target", originalTarget);
      } else {
        activeForm.removeAttribute("target");
      }
      activeForm.enctype = originalEnctype;
      activeForm.method = originalMethod;

      for (const [input, value] of managedInputs.entries()) {
        if (!input.isConnected) {
          continue;
        }
        // 文件输入框只能设置为空字符串（浏览器安全限制）
        if (input.type === 'file') {
          input.value = "";
        } else {
          input.value = value ?? "";
        }
      }
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
      console.debug("[NASGE] 准备提交 Steam 上传表单", {
        action: activeForm.action,
        target: activeForm.target,
        hasFile: Boolean(activeFileInput.files?.length),
        fileSize: activeFileInput.files?.[0]?.size ?? 0
      });

      const submitter = findSubmitButton(activeForm);
      if (submitter) {
        submitter.click();
      } else if (typeof activeForm.requestSubmit === "function") {
        activeForm.requestSubmit();
      } else {
        activeForm.submit();
      }
    } catch (error) {
      window.clearTimeout(timeout);
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function findSubmitButton(
  form: HTMLFormElement
): HTMLButtonElement | HTMLInputElement | null {
  const submitSelector = "button[type='submit'], input[type='submit'], input[type='image']";
  const submitter = form.querySelector<HTMLButtonElement | HTMLInputElement>(submitSelector);
  return submitter ?? null;
}

function attachDebugListener(input: HTMLInputElement): void {
  if (input.dataset.nasgeDebugAttached === "true") {
    return;
  }
  input.dataset.nasgeDebugAttached = "true";
  input.addEventListener(
    "change",
    (event) => {
      const files = (event.target as HTMLInputElement)?.files;
      const file = files && files.length ? files[0] : null;
      console.info("[NASGE] 捕获到 Steam 表单 change 事件", {
        isTrusted: event.isTrusted,
        fileName: file?.name,
        fileSize: file?.size,
        filesLength: files?.length
      });
    },
    { capture: true }
  );
}

function registerInput(
  input: HTMLInputElement,
  registry: Map<HTMLInputElement, string>
): void {
  if (!registry.has(input)) {
    registry.set(input, input.value ?? "");
  }
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

function parseSize(value?: string): number | null {
  if (!value) {
    return null;
  }

  const match = value.match(/(\d+)/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function interpretUploadRedirect(url: string): { previewIds: string[] } {
  const parsed = new URL(url);
  const successCode = parsed.searchParams.get("fileuploadsuccess") ?? "0";
  const previewIds = parsed.searchParams.getAll("previewid[]").filter(Boolean);
  const errorCode = parsed.searchParams.get("error") ?? parsed.searchParams.get("warning");

  if (successCode !== "1") {
    const mappedMessage = mapSteamUploadError(successCode, errorCode);
    throw new Error(mappedMessage);
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
    console.info("[NASGE] 在 manageguide 页面，从 gPreviewImages 桥接数据读取");
    return parseGuideImagePoolFromDOM();
  }

  if (isEditSubsectionPage) {
    console.info("[NASGE] 在 editguidesubsection 页面，从页面 DOM 直接读取图片池");
    return parseGuideImagePoolFromEditSubsectionDOM();
  }

  // 其他页面（如章节编辑页）：尝试 AJAX
  console.info("[NASGE] 尝试通过 AJAX 拉取图片池");

  let sessionId: string | undefined;
  let consumerAppId: string | undefined;
  let guideId: string | undefined;

  try {
    const { form } = resolveUploadElements(scope);
    sessionId = readFormField(form, "sessionid");
    consumerAppId = readFormField(form, "consumer_app_id");
    guideId = readFormField(form, "publishedfileid") ?? readFormField(form, "id");
  } catch (error) {
    console.warn("[NASGE] 无法从上传表单读取字段，尝试其他方式", error);
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
        console.info("[NASGE] 从表单中提取 sessionid");
        break;
      }
    }
  }

  // 从 cookie 中提取 sessionid（Steam 通常会设置）
  if (!sessionId) {
    const match = document.cookie.match(/sessionid=([^;]+)/);
    if (match) {
      sessionId = decodeURIComponent(match[1]);
      console.info("[NASGE] 从 cookie 中提取 sessionid");
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
        console.info("[NASGE] 从指南详情页提取 appid", consumerAppId);
      }
    } catch (error) {
      console.warn("[NASGE] 无法从指南详情页提取 appid", error);
    }
  }

  console.info("[NASGE] 收集到的上下文信息", {
    sessionId: sessionId ? "存在" : "缺失",
    consumerAppId,
    guideId
  });

  if (!sessionId || !guideId) {
    throw new Error(`无法收集 Steam 图片池所需的上下文信息。sessionId: ${!!sessionId}, guideId: ${!!guideId}`);
  }

  if (!consumerAppId) {
    console.warn("[NASGE] 无法自动获取 consumer_app_id，这可能导致图片池为空");
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

    console.info("[NASGE] 发起 AJAX 请求", { page: currentPage, params: params.toString() });

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
      throw new Error(`拉取 Steam 图片池失败：HTTP ${response.status}`);
    }

    const html = await response.text();
    console.info("[NASGE] AJAX 响应长度", { page: currentPage, length: html.length });

    const pageImages = parseGuideImagePool(html);
    console.info("[NASGE] 本页图片数量", { page: currentPage, count: pageImages.length });

    if (pageImages.length === 0) {
      // 没有更多图片了
      break;
    }

    allImages.push(...pageImages);
    currentPage++;
  }

  console.info("[NASGE] AJAX 加载完成，共", allImages.length, "张图片");
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
      originalUrl: thumbnailUrl  // AJAX: 使用 thumbnailUrl 作为 originalUrl
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
        console.warn('[NASGE Content Script] 刷新请求超时，使用现有数据');
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
      console.warn('[NASGE Content Script] ❌ gPreviewImages 不存在或为空');
    }
  } catch (error) {
    console.error('[NASGE] 读取页面桥接数据失败:', error);
  }

  if (Array.isArray(globalVar) && globalVar.length > 0) {
    console.info('[NASGE] ✅ 从全局变量 gPreviewImages 解析图片池');

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
    console.info(`[NASGE] 从 gPreviewImages 解析到 ${images.size} 张图片`);
    return Array.from(images.values());
  }

  // Fallback: 从 DOM 解析
  console.warn('[NASGE] ❌ gPreviewImages 不可用，尝试从 DOM 解析');

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
          originalUrl: thumbnailUrl  // DOM fallback: 使用 thumbnailUrl 作为 originalUrl
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
            console.log('[NASGE 最终检查] ✅ gPreviewImages 已写入 DOM，共', window.gPreviewImages.length, '张图片');
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
    console.warn('[NASGE] 最终检查失败:', error);
  }

  if (Array.isArray(globalVarFinal) && globalVarFinal.length > 0) {
    console.log('[NASGE] ✅ 最终检查：发现 gPreviewImages，合并透明URL');
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

  console.info(`[NASGE] 从 DOM 解析到 ${images.size} 张图片`);
  return Array.from(images.values());
}

function parseGuideImagePoolFromEditSubsectionDOM(): SteamGuideImage[] {
  const images = new Map<string, SteamGuideImage>();

  const previewImagesContainer = document.querySelector('#PreviewImages');
  if (!previewImagesContainer) {
    console.warn('[NASGE] 未找到 #PreviewImages 容器');
    return [];
  }

  const imageElements = previewImagesContainer.querySelectorAll('img[id][src*="steamusercontent"]');
  console.info(`[NASGE] 在 #PreviewImages 中找到 ${imageElements.length} 张图片`);

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
        originalUrl: absoluteThumbnailUrl  // editguidesubsection: 使用 thumbnailUrl 作为 originalUrl
      });
    }
  }

  console.info(`[NASGE] 从 editguidesubsection DOM 解析到 ${images.size} 张图片`, Array.from(images.values()));
  return Array.from(images.values());
}

export async function deleteGuideImage(scope: UploadScope, previewId: string): Promise<void> {
  console.info("[NASGE] 准备删除图片", { scope, previewId });

  let sessionId: string | undefined;
  let guideId: string | undefined;

  try {
    const { form } = resolveUploadElements(scope);
    sessionId = readFormField(form, "sessionid");
    guideId = readFormField(form, "id") ?? readFormField(form, "publishedfileid");
  } catch (error) {
    console.warn("[NASGE] 无法从表单读取删除参数，尝试其他方式", error);
  }

  if (!sessionId) {
    sessionId = (window as any).g_sessionID;
  }

  if (!guideId) {
    guideId = new URL(window.location.href).searchParams.get("id") ?? undefined;
  }

  if (!sessionId || !guideId) {
    console.error("[NASGE] 删除图片失败：缺少必要参数", { sessionId: !!sessionId, guideId });
    throw new Error("无法收集删除图片所需的上下文信息（sessionid/id）。");
  }

  const params = new URLSearchParams();
  params.set("id", guideId);
  params.set("sessionid", sessionId);
  params.set("previewid", previewId);
  params.set("ajax", "true");

  console.info("[NASGE] 发送删除请求", {
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
    console.error("[NASGE] 删除请求失败", { status: response.status, statusText: response.statusText });
    throw new Error(`删除图片失败：HTTP ${response.status}`);
  }

  const result = await response.json();
  console.info("[NASGE] 删除请求响应", result);

  if (result.success !== 1) {
    throw new Error("Steam 删除图片失败，请刷新页面后重试。");
  }

  console.info("[NASGE] 成功删除图片，开始清理 DOM", previewId);

  const isEditSubsectionPage = window.location.href.includes("/editguidesubsection/");
  if (isEditSubsectionPage) {
    const imgElement = document.querySelector(`#PreviewImages img[id="${previewId}"]`);
    if (imgElement) {
      const container = imgElement.closest('.previewImage, div[class*="preview"]');
      if (container) {
        container.remove();
        console.info("[NASGE] 已从 DOM 中移除图片容器", previewId);
      } else {
        imgElement.remove();
        console.info("[NASGE] 已从 DOM 中移除图片元素", previewId);
      }
    } else {
      console.warn("[NASGE] 未在 DOM 中找到要移除的图片", previewId);
    }
  }

  console.info("[NASGE] 图片删除完成", previewId);
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

function createUploadFrame(): HTMLIFrameElement {
  const frame = document.createElement("iframe");
  frame.name = `nasge_upload_${Date.now().toString(36)}`;
  frame.style.display = "none";
  frame.setAttribute("data-nasge-managed", "true");
  document.body.appendChild(frame);
  return frame;
}

function fireUpdateEvents(input: HTMLInputElement): void {
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

type PreparationResult = {
  context: UploadContext;
  form: HTMLFormElement;
  fileInput: HTMLInputElement;
};

async function waitForSteamPreparation(
  scope: UploadScope,
  initialForm: HTMLFormElement,
  initialInput: HTMLInputElement,
  file: File,
  registry: Map<HTMLInputElement, string>
): Promise<PreparationResult | null> {
  const deadline = Date.now() + 7_000;
  let lastContext: UploadContext | null = null;
  let currentForm = initialForm;
  let currentInput = initialInput;

  while (Date.now() < deadline) {
    try {
      const resolved = resolveUploadElements(scope);
      if (resolved.form !== currentForm) {
        currentForm = resolved.form;
        console.info("[NASGE] 发现新的 Steam 上传表单节点，已切换。");
      }
      if (resolved.fileInput !== currentInput) {
        currentInput = resolved.fileInput;
        registerInput(currentInput, registry);
        attachDebugListener(currentInput);
        console.info("[NASGE] 发现新的 Steam 文件输入控件，尝试同步文件。");
      }
    } catch {
      // 如果在握手过程中短暂找不到表单，沿用前一次引用即可。
    }

    if (!currentInput.files || !currentInput.files.length || currentInput.files[0]?.size !== file.size) {
      if (assignFileToInput(currentInput, file)) {
        fireUpdateEvents(currentInput);
        console.info("[NASGE] 已向最新的 Steam 输入控件写入文件以继续握手。");
      }
    }

    const context = extractUploadContext(scope, currentForm);
    lastContext = context;

    const sizeRaw =
      context.fields["file_size"] ??
      context.fields["file_size[]"] ??
      context.fields["filesize"];
    const prefix = context.fields["cloudfilenameprefix"] ?? context.fields["cloudfilenameprefix[]"];
    const token = context.fields["token"] ?? context.fields["token[]"];

    const sizeParsed = parseSize(sizeRaw);
    const sizeReady = sizeParsed === file.size;
    if (prefix && token && sizeReady) {
      console.info("[NASGE] Steam 准备完成", {
        prefix,
        sizeRaw,
        sizeParsed,
        expectedSize: file.size,
        token: token.slice?.(0, 8)
      });
      return { context, form: currentForm, fileInput: currentInput };
    }

    await delay(120);
  }

  console.info("[NASGE] Steam 自动准备在时限内未完成，启用后备方案。", {
    lastContext
  });
  return null;
}

function manualPrepareUpload(
  scope: UploadScope,
  file: File,
  registry: Map<HTMLInputElement, string>
): PreparationResult {
  const { form, fileInput } = resolveUploadElements(scope);
  registerInput(fileInput, registry);
  attachDebugListener(fileInput);

  if (!assignFileToInput(fileInput, file)) {
    throw new Error("未能为 Steam 表单附加上传文件，请确认页面状态后重试。");
  }

  fireUpdateEvents(fileInput);
  ensureFileSizeFields(form, file.size);
  ensureCloudFilenamePrefix(form);

  const context = extractUploadContext(scope, form);

  console.info("[NASGE] 手动填充 Steam 上传字段", {
    cloudfilenameprefix:
      context.fields["cloudfilenameprefix"] ?? context.fields["cloudfilenameprefix[]"],
    fileSizeField:
      context.fields["file_size"] ??
      context.fields["file_size[]"] ??
      context.fields["filesize"],
    action: context.action
  });

  return { context, form, fileInput };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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

function createUploadForm(
  context: UploadContext,
  file: File,
  target: string,
  dimensions: { width: number; height: number }
): HTMLFormElement {
  const form = document.createElement("form");
  form.action = context.action;
  form.method = "POST";
  form.enctype = "multipart/form-data";
  form.target = target;
  form.style.display = "none";

  for (const [key, value] of Object.entries(context.fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = key;

    if (key === "image_width") {
      input.value = String(dimensions.width ?? 0);
    } else if (key === "image_height") {
      input.value = String(dimensions.height ?? 0);
    } else {
      input.value = value;
    }

    form.appendChild(input);
  }

  if (!("image_width" in context.fields)) {
    const widthInput = document.createElement("input");
    widthInput.type = "hidden";
    widthInput.name = "image_width";
    widthInput.value = String(dimensions.width ?? 0);
    form.appendChild(widthInput);
  }

  if (!("image_height" in context.fields)) {
    const heightInput = document.createElement("input");
    heightInput.type = "hidden";
    heightInput.name = "image_height";
    heightInput.value = String(dimensions.height ?? 0);
    form.appendChild(heightInput);
  }

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.name = context.fileFieldName || "file";
  fileInput.style.display = "none";
  if (context.fileInputMultiple) {
    fileInput.multiple = true;
  }

  const transfer = new DataTransfer();
  transfer.items.add(file);
  fileInput.files = transfer.files;

  if (!fileInput.files || fileInput.files.length === 0) {
    throw new Error("未能构造上传文件，请重试。");
  }

  form.appendChild(fileInput);

  return form;
}
