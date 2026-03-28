import type { ReviewFormData } from "../shared/messages";

/**
 * 从 Steam 商店页评测表单读取所有字段数据
 */
export function readReviewForm(): ReviewFormData {
  // 评测文本
  const textarea = document.querySelector<HTMLTextAreaElement>("#game_recommendation");
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
  const visibilityInput = document.querySelector<HTMLInputElement>("#ReviewVisibility");
  const visibility: "public" | "friends" =
    visibilityInput?.value === "1" ? "friends" : "public";

  // 语言（hidden input）
  const languageInput = document.querySelector<HTMLInputElement>("#ReviewLanguage");
  const language = languageInput?.value ?? "";

  // 复选框
  const enableCommentsCheckbox = document.querySelector<HTMLInputElement>(
    "#EnableReviewComments"
  );
  const enableComments = enableCommentsCheckbox?.checked ?? true;

  const attachHardwareCheckbox = document.querySelector<HTMLInputElement>(
    "#AttachedPCHardware"
  );
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
  };
}

/**
 * 将文本写入评测 textarea
 */
export function writeReviewText(text: string): void {
  const textarea = document.querySelector<HTMLTextAreaElement>("#game_recommendation");
  if (!textarea) {
    throw new Error("未找到评测输入框 (#game_recommendation)");
  }
  textarea.value = text;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * 通过 Steam API 提交评测
 */
export async function submitReviewToSteam(data: {
  comment: string;
  rated_up: boolean;
  is_public: boolean;
  language: string;
  received_compensation: number;
  disable_comments: number;
}): Promise<void> {
  // 从 URL 提取 appId
  const appIdMatch = window.location.pathname.match(/\/app\/(\d+)/);
  const appId = appIdMatch?.[1];
  if (!appId) {
    throw new Error("无法从 URL 提取 appId");
  }

  // 获取 sessionid
  const sessionId = getSessionId();
  if (!sessionId) {
    throw new Error("无法获取 Steam sessionid，请确认已登录");
  }

  // 读取页面上的硬件配置 ID
  const hardwareInput = document.querySelector<HTMLInputElement>("#AttachedPCHardware");
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
    throw new Error(`提交评测失败：HTTP ${response.status}`);
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(
      `Steam 提交评测失败：${result.errmsg ?? JSON.stringify(result)}`
    );
  }
}

function getSessionId(): string | undefined {
  // 尝试从 cookie 读取
  const match = document.cookie.match(/sessionid=([^;]+)/);
  if (match) {
    return decodeURIComponent(match[1]);
  }
  return undefined;
}
