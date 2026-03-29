/**
 * 上传错误消息格式化
 */
export function formatUploadErrorMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : "";
  if (rawMessage.includes("Could not establish connection") || rawMessage.includes("Receiving end does not exist")) {
    return "未能连接到 Steam 页面，请确认已打开 Steam 指南编辑页并刷新后重试。";
  }

  if (rawMessage.includes("The message port closed before a response was received")) {
    return "未收到 Steam 页面响应，请刷新相关页面后重试。";
  }

  if (rawMessage.includes("扩展尚未获得访问 Steam 网页的权限")) {
    return rawMessage;
  }

  if (/错误码\s*8/.test(rawMessage)) {
    return "Steam 返回错误 8：无法解析图片文件，请确认图片未损坏并重新尝试。";
  }

  if (/错误码\s*29/.test(rawMessage)) {
    return "Steam 返回错误 29：Steam 会话可能已失效或账号当前不可上传，请刷新 Steam 页面后重试。";
  }

  if (rawMessage) {
    return rawMessage;
  }

  return "上传失败，未知错误。";
}
