/**
 * Steam 指南字符数 / 图片大小限制常量
 *
 * 这些限制是 Steam 服务器端的硬性限制，超出会导致保存失败（8号错误）或上传失败
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

/**
 * Steam 单张图片上传大小限制：2MB
 * 超出会导致上传失败，入池/上传链路均使用此常量做前置校验
 */
export const STEAM_IMAGE_SIZE_LIMIT = 2 * 1024 * 1024;
