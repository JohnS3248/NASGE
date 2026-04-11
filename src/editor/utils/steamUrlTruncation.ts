/**
 * Steam [screenshot] / [previewimg] URL 截断行为模拟器
 *
 * Steam 指南 BBCode 解析器对外链图片 URL 做纯字符白名单扫描（不 URL decode），
 * 遇到首个危险字符立即截断，截断点在该字符之前（字符本身被吃）。
 * 同时 `?` / `#` 会让整段 query / hash 丢弃，不参与扫描。
 *
 * Steam 自有 CDN 白名单跳过截断：它们的 URL 由 Steam 自己生成落在安全字符集内，
 * 且常带 `?imw=...` query，对其套截断反而会让真·Steam 截图看起来像挂图。
 */

/** 20 个危险字符：遇到任意一个立即截断 */
const DANGER = /[_*~\[\]{}|"\s;=&+()<>'@%]/;

/** Steam 自有 CDN 域名后缀白名单 — 跳过截断模拟 */
const STEAM_CDN_SUFFIXES = [
  ".akamaihd.net",
  ".steamstatic.com",
  ".steamusercontent.com",
  ".steamcommunity.com",
  ".steampowered.com"
];

/** Steam 自有 CDN 完整域名白名单（无子域） */
const STEAM_CDN_HOSTS = [
  "steamusercontent.com",
  "steamcommunity.com",
  "steampowered.com",
  "images.steamusercontent.com"
];

export interface SteamUrlAnalysis {
  /** Steam 实际会渲染的 URL（应用截断与 query/hash 丢弃后） */
  truncated: string;
  /** 触发截断的字符（截断点处那一个，未触发时为空数组） */
  dangerousChars: string[];
  /** 是否整个 query string 被丢弃 */
  droppedQuery: boolean;
  /** 是否整个 hash 被丢弃 */
  droppedHash: boolean;
  /** 该 URL 是否命中 Steam 自有 CDN 白名单（白名单命中 = 跳过截断） */
  isSteamCdn: boolean;
  /**
   * 编辑器与 Steam 端渲染结果是否完全一致：
   * - Steam CDN 白名单 URL: 总是 true（信任原 URL）
   * - 外链: 无危险字符 && 无 query/hash
   */
  isSafe: boolean;
}

/**
 * 判断 URL 是否命中 Steam 自有 CDN 白名单。
 * 白名单内的 URL 由 Steam 自己产出，保证安全字符集，无需本地模拟截断。
 */
export function isSteamCdnUrl(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (STEAM_CDN_HOSTS.includes(hostname)) return true;
  return STEAM_CDN_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

/**
 * 应用 Steam 截断规则到任意 URL（不查白名单，纯算法）。
 *
 * 算法：
 * 1. 切掉 `#` 及之后
 * 2. 切掉 `?` 及之后
 * 3. 找首个危险字符，截到该字符之前
 * 4. 不做任何 URL decode（`%` 本身就是危险字符）
 */
export function applyTruncationRules(url: string): Omit<SteamUrlAnalysis, "isSteamCdn"> {
  const hashIdx = url.indexOf("#");
  const droppedHash = hashIdx >= 0;
  const noHash = droppedHash ? url.slice(0, hashIdx) : url;

  const queryIdx = noHash.indexOf("?");
  const droppedQuery = queryIdx >= 0;
  const noQuery = droppedQuery ? noHash.slice(0, queryIdx) : noHash;

  const match = noQuery.match(DANGER);
  const truncated = match ? noQuery.slice(0, match.index!) : noQuery;
  const dangerousChars = match ? [match[0]] : [];

  return {
    truncated,
    dangerousChars,
    droppedQuery,
    droppedHash,
    isSafe: !match && !droppedQuery && !droppedHash
  };
}

/**
 * 模拟 Steam BBCode 解析器对外链图片 URL 的截断行为。
 *
 * Steam CDN 白名单 URL：原样返回，isSafe=true（信任 Steam 自家 CDN）。
 * 外链 URL：套用 applyTruncationRules。
 */
export function simulateSteamUrlTruncation(url: string): SteamUrlAnalysis {
  if (isSteamCdnUrl(url)) {
    return {
      truncated: url,
      dangerousChars: [],
      droppedQuery: false,
      droppedHash: false,
      isSteamCdn: true,
      isSafe: true
    };
  }

  return {
    ...applyTruncationRules(url),
    isSteamCdn: false
  };
}
