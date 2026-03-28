import type { ReviewFormData } from "../shared/messages";

/**
 * 检测是否已有评测，并提取 recommendationID
 *
 * Content script 运行在 ISOLATED world，无法访问页面 JS 全局变量，
 * 但可以读取 DOM 和内联 <script> 标签的 textContent。
 */
function detectExistingReview(): {
  exists: boolean;
  recommendationId: string | null;
} {
  // 检查 #recommendation_success 是否存在且可见（已有评测时显示）
  const successEl = document.getElementById("recommendation_success");
  if (!successEl || successEl.style.display === "none") {
    return { exists: false, recommendationId: null };
  }

  // 从页面内联 script 标签提取 recommendationID
  // DoRecommend 函数中包含 UserReview_Update('221951936', ...)
  const scripts = document.querySelectorAll("script:not([src])");
  for (const script of scripts) {
    const text = script.textContent ?? "";
    const match = text.match(/UserReview_Update\(\s*'(\d+)'/);
    if (match) {
      return { exists: true, recommendationId: match[1] };
    }
  }

  // 存在已有评测但无法提取 ID（不应发生）
  return { exists: true, recommendationId: null };
}

/**
 * 从 Steam 商店页评测表单读取所有字段数据
 */
export function readReviewForm(): ReviewFormData {
  // 检测已有评测状态
  const { exists: hasExistingReview, recommendationId } =
    detectExistingReview();

  // 评测文本
  const textarea = document.querySelector<HTMLTextAreaElement>(
    "#game_recommendation"
  );
  const text = textarea?.value ?? "";

  // 推荐/不推荐
  const voteUpBtn = document.getElementById("VoteUpBtn");
  const voteDownBtn = document.getElementById("VoteDownBtn");
  let ratedUp: boolean | null = null;
  if (voteUpBtn?.classList.contains("btn_active")) {
    ratedUp = true;
  } else if (voteDownBtn?.classList.contains("btn_active")) {
    ratedUp = false;
  }

  // 可见性（hidden input，值 "0" = public, "1" = friends）
  const visibilityInput =
    document.querySelector<HTMLInputElement>("#ReviewVisibility");
  const visibility: "public" | "friends" =
    visibilityInput?.value === "1" ? "friends" : "public";

  // 语言（hidden input）
  const languageInput =
    document.querySelector<HTMLInputElement>("#ReviewLanguage");
  const language = languageInput?.value ?? "";

  // 复选框
  const enableCommentsCheckbox = document.querySelector<HTMLInputElement>(
    "#EnableReviewComments"
  );
  const enableComments = enableCommentsCheckbox?.checked ?? true;

  const attachHardwareCheckbox =
    document.querySelector<HTMLInputElement>("#AttachedPCHardware");
  const attachHardware = attachHardwareCheckbox?.checked ?? false;

  const receivedCompensationCheckbox = document.querySelector<HTMLInputElement>(
    "#ReviewReceivedCompensation"
  );
  const receivedCompensation = receivedCompensationCheckbox?.checked ?? false;

  // 从 URL 提取 appId
  const appIdMatch = window.location.pathname.match(/\/app\/(\d+)/);
  const appId = appIdMatch?.[1] ?? "";

  // 游戏名
  const gameNameEl =
    document.querySelector(".apphub_AppName") ??
    document.getElementById("appHubAppName");
  const gameName = gameNameEl?.textContent?.trim() ?? "";

  return {
    text,
    ratedUp,
    visibility,
    language,
    enableComments,
    attachHardware,
    receivedCompensation,
    appId,
    gameName,
    hasExistingReview,
    recommendationId,
  };
}

/**
 * 将文本写入评测 textarea
 */
export function writeReviewText(text: string): void {
  const textarea = document.querySelector<HTMLTextAreaElement>(
    "#game_recommendation"
  );
  if (!textarea) {
    throw new Error("未找到评测输入框 (#game_recommendation)");
  }
  textarea.value = text;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * 通过 Steam API 提交评测（自动判断创建/更新）
 */
export async function submitReviewToSteam(data: {
  comment: string;
  rated_up: boolean;
  is_public: boolean;
  language: string;
  received_compensation: number;
  disable_comments: number;
}): Promise<{ created: boolean }> {
  // 获取 sessionid
  const sessionId = getSessionId();
  if (!sessionId) {
    throw new Error("无法获取 Steam sessionid，请确认已登录");
  }

  // 检测是否已有评测
  const { exists, recommendationId } = detectExistingReview();

  if (exists && recommendationId) {
    // ===== 更新已有评测 =====
    return await updateReview(recommendationId, data, sessionId);
  } else {
    // ===== 创建新评测 =====
    return await createReview(data, sessionId);
  }
}

/**
 * 创建新评测：POST /friends/recommendgame
 */
async function createReview(
  data: {
    comment: string;
    rated_up: boolean;
    is_public: boolean;
    language: string;
    received_compensation: number;
    disable_comments: number;
  },
  sessionId: string
): Promise<{ created: boolean }> {
  const appIdMatch = window.location.pathname.match(/\/app\/(\d+)/);
  const appId = appIdMatch?.[1];
  if (!appId) {
    throw new Error("无法从 URL 提取 appId");
  }

  const hardwareInput =
    document.querySelector<HTMLInputElement>("#AttachedPCHardware");
  const savedHardwareId = hardwareInput?.value ?? "0";

  const params = new URLSearchParams();
  params.set("appid", appId);
  params.set("steamworksappid", appId);
  params.set("comment", data.comment);
  params.set("rated_up", data.rated_up ? "true" : "false");
  params.set("is_public", data.is_public ? "true" : "false");
  params.set("language", data.language);
  params.set("received_compensation", String(data.received_compensation));
  params.set("disable_comments", String(data.disable_comments));
  params.set("saved_hardware_id", savedHardwareId);
  params.set("sessionid", sessionId);

  const response = await fetch(
    "https://store.steampowered.com/friends/recommendgame",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: params.toString(),
      credentials: "include",
    }
  );

  if (!response.ok) {
    throw new Error(`创建评测失败：HTTP ${response.status}`);
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(
      `Steam 创建评测失败：${result.strError ?? JSON.stringify(result)}`
    );
  }

  return { created: true };
}

/**
 * 更新已有评测：POST /userreviews/update/{recommendationID}
 */
async function updateReview(
  recommendationId: string,
  data: {
    comment: string;
    rated_up: boolean;
    is_public: boolean;
    language: string;
    received_compensation: number;
    disable_comments: number;
  },
  sessionId: string
): Promise<{ created: boolean }> {
  const hardwareInput =
    document.querySelector<HTMLInputElement>("#AttachedPCHardware");
  const savedHardwareId = hardwareInput?.value ?? "0";

  const params = new URLSearchParams();
  params.set("review_text", data.comment);
  params.set("voted_up", data.rated_up ? "1" : "0");
  params.set("is_public", data.is_public ? "true" : "false");
  params.set("language", data.language);
  params.set("received_compensation", String(data.received_compensation));
  params.set("comments_disabled", String(data.disable_comments));
  params.set("saved_hardware_id", savedHardwareId);
  params.set("sessionid", sessionId);

  const response = await fetch(
    `https://store.steampowered.com/userreviews/update/${recommendationId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: params.toString(),
      credentials: "include",
    }
  );

  if (!response.ok) {
    throw new Error(`更新评测失败：HTTP ${response.status}`);
  }

  const result = await response.json();
  if (result.success !== 1) {
    throw new Error(
      `Steam 更新评测失败：${JSON.stringify(result)}`
    );
  }

  return { created: false };
}

function getSessionId(): string | undefined {
  const match = document.cookie.match(/sessionid=([^;]+)/);
  if (match) {
    return decodeURIComponent(match[1]);
  }
  return undefined;
}
