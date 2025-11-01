import type {
  SteamUploadRequest,
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

  let preparation: PreparationResult;
  try {
    preparation = await waitForSteamPreparation(
      request.scope,
      initialForm,
      initialFileInput,
      file,
      managedInputs
    );
  } catch (error) {
    console.warn("[NASGE] Steam 自动准备阶段失败，尝试手动补齐字段。", error);
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
        input.value = value ?? "";
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
  const success = parsed.searchParams.get("fileuploadsuccess") === "1";
  const previewIds = parsed.searchParams.getAll("previewid[]").filter(Boolean);
  const errorCode = parsed.searchParams.get("error") ?? parsed.searchParams.get("warning");

  if (!success) {
    throw new Error(
      errorCode
        ? `Steam 上传失败（错误码 ${errorCode}）。`
        : "Steam 上传失败，未收到成功标记。"
    );
  }

  if (!previewIds.length) {
    throw new Error("Steam 上传成功但未返回 previewid。");
  }

  return { previewIds };
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
): Promise<PreparationResult> {
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

  console.warn("[NASGE] 等待 Steam 准备超时，最后上下文:", lastContext);
  throw new Error("等待 Steam 准备上传超时，请确认页面状态后重试。");
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
