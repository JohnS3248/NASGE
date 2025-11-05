/**
 * Steam 指南字符数限制常量
 *
 * 这些限制是 Steam 服务器端的硬性限制，超出会导致保存失败（8号错误）
 */

/**
 * 章节标题最大字符数（BBCode 格式）
 * 包括所有 BBCode 标签
 */
export const TITLE_CHARACTER_LIMIT = 96;

/**
 * 章节正文最大字符数（BBCode 格式）
 * 包括所有 BBCode 标签
 */
export const CONTENT_CHARACTER_LIMIT = 8000;

/**
 * 字符数警告阈值（占总限制的百分比）
 * 超过此阈值显示橙色警告
 */
export const WARNING_THRESHOLD_PERCENT = 0.9;
