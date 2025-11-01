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
  const fileBytes = new Uint8Array(request.file.data);
  const file = new File([fileBytes], request.file.name, {
    type: request.file.type,
    lastModified: Date.now()
  });

  console.debug("[NASGE] 上传桥接：创建文件对象", {
    name: file.name,
    size: file.size,
    type: file.type
  });

  const context = extractUploadContext(request.scope);
  const frame = createUploadFrame();
  const dimensions = await readImageDimensions(file);
  const form = createUploadForm(context, file, frame.name, dimensions);

  document.body.appendChild(form);

  return new Promise<UploadResult>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      form.remove();
      frame.removeEventListener("load", handleLoad);
      if (frame.dataset.nasgeManaged === "true") {
        frame.remove();
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
        // 初始跨域跳转（ufs *.steamserver），等待下一个 load 事件
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

function extractUploadContext(scope: UploadScope): UploadContext {
  const finder = UPLOAD_SELECTORS[scope];
  const form = finder?.() ?? null;

  if (!form) {
    throw new Error("未能在当前页面找到 Steam 上传表单，请确认页面位置是否正确。");
  }

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
    fields
  };
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
      input.value = String(dimensions.width);
    } else if (key === "image_height") {
      input.value = String(dimensions.height);
    } else {
      input.value = value;
    }

    form.appendChild(input);
  }

  if (!("image_width" in context.fields)) {
    const widthInput = document.createElement("input");
    widthInput.type = "hidden";
    widthInput.name = "image_width";
    widthInput.value = String(dimensions.width);
    form.appendChild(widthInput);
  }

  if (!("image_height" in context.fields)) {
    const heightInput = document.createElement("input");
    heightInput.type = "hidden";
    heightInput.name = "image_height";
    heightInput.value = String(dimensions.height);
    form.appendChild(heightInput);
  }

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.name = "file";
  fileInput.style.display = "none";

  const transfer = new DataTransfer();
  transfer.items.add(file);
  fileInput.files = transfer.files;

  if (!fileInput.files || fileInput.files.length === 0) {
    throw new Error("未能构造上传文件，请重试。");
  }

  console.debug("[NASGE] 上传桥接：挂载文件", {
    generatedName: file.name,
    size: fileInput.files[0]?.size,
    type: fileInput.files[0]?.type
  });

  form.appendChild(fileInput);

  return form;
}
