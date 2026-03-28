import type {
  SteamBridgeResponse,
  ReviewFormData,
} from "../../shared/messages";

function sendMessage<T = unknown>(message: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { channel: "nasge:steam", ...message },
      (response: SteamBridgeResponse<T>) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response || !response.ok) {
          reject(new Error((response as { error?: string })?.error ?? "未知错误"));
          return;
        }
        resolve(response.data);
      }
    );
  });
}

export async function fetchReviewForm(): Promise<ReviewFormData> {
  return sendMessage<ReviewFormData>({ action: "fetch-review" });
}

export async function writeReviewText(text: string): Promise<void> {
  await sendMessage({ action: "write-review-text", text });
}

export async function submitReview(data: {
  comment: string;
  rated_up: boolean;
  is_public: boolean;
  language: string;
  received_compensation: number;
  disable_comments: number;
}): Promise<{ created: boolean }> {
  return sendMessage<{ created: boolean }>({ action: "submit-review", data });
}
