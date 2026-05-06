import { useSteamGuideImageStore } from '../stores/useSteamGuideImageStore';
import { parseSizeToken, parseAlignmentToken, sanitizeFileName } from './previewImageBBCode';
import { loggers } from '../../shared/logger';

const INLINE_MARKS: Record<string, { open: string; close: string }> = {
  strong: { open: "[b]", close: "[/b]" },
  b: { open: "[b]", close: "[/b]" },
  em: { open: "[i]", close: "[/i]" },
  i: { open: "[i]", close: "[/i]" },
  u: { open: "[u]", close: "[/u]" },
  s: { open: "[strike]", close: "[/strike]" },
  strike: { open: "[strike]", close: "[/strike]" },
  "span.nasge-spoiler": { open: "[spoiler]", close: "[/spoiler]" }
};

/**
 * 从图片池中查找 previewId 对应的透明背景 URL
 * @param previewId Steam 短 ID
 * @returns 完整的透明背景图片 URL，如果找不到则返回 null
 */
function getImageUrlFromPool(previewId: string): string | null {
  const imagePool = useSteamGuideImageStore.getState().items;
  const image = imagePool.find(img => img.previewId === previewId);

  if (image?.originalUrl) {
    return image.originalUrl;
  }

  loggers.editor.verbose('bbcodeToHtml 图片池中未找到:', previewId);
  return null;
}

type SerializeContext = {
  isLastSibling: boolean;
};

type BlockOptions = {
  trailing?: string;
};

function block(content: string, context: SerializeContext, options: BlockOptions = {}): string {
  const suffix = options.trailing ?? "\n";
  return `${content}${suffix}`;
}

export function htmlToBBCode(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";
  const nodes = Array.from(root.childNodes) as (HTMLElement | Text)[];
  return nodes
    .map((node, index) =>
      serializeNode(node, {
        isLastSibling: index === nodes.length - 1
      })
    )
    .join("")
    .replace(/\s+$/, "");  // 只去除末尾空白，不压缩换行
}

const PREV_BLOCK_TAGS_RE = /^(blockquote|h[1-6]|ul|ol|table|hr|figure|pre|p|div)$/i;

function serializeNode(node: HTMLElement | Text, context: SerializeContext): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    // 当前 text node 紧跟 block 元素时,leading \n 是 HTML 美化 artifact
    // (与 wrapTextInParagraphs 的 lastWasBlock 一致:block 后第一个 \n 是隐含的)
    // 吸收掉这一个 \n 防止嵌套 quote round-trip 累积换行
    const prev = node.previousSibling;
    if (prev && prev.nodeType === Node.ELEMENT_NODE) {
      const prevTag = (prev as HTMLElement).tagName.toLowerCase();
      if (PREV_BLOCK_TAGS_RE.test(prevTag)) {
        return text.replace(/^\n/, "");
      }
    }
    return text;
  }

  if (!(node instanceof HTMLElement)) return "";

  const tagName = node.tagName.toLowerCase();

  if (tagName === "p") {
    const body = serializeChildren(node);
    if (!body.trim()) {
      return block("", context, { trailing: "\n" });
    }
    return block(body, context);
  }

  if (tagName === "blockquote") {
    // 作者标识行已改用 CSS ::before 伪元素渲染(.nasge-quote[data-author]::before),
    // DOM 中不再插入 <p>引用自 X：</p>,因此 serialize children 不需要过滤。
    // 作者从 data-author attr 读取,序列化为 [quote=author]。
    const author = node.getAttribute("data-author") ?? "";
    const childNodes = Array.from(node.childNodes) as (HTMLElement | Text)[];
    const body = childNodes
      .map((child, index) =>
        serializeNode(child, {
          isLastSibling: index === childNodes.length - 1
        })
      )
      .join("")
      .trim();
    const quote = author ? `[quote=${author}]${body}[/quote]` : `[quote]${body}[/quote]`;
    return block(quote, context);
  }

  if (tagName === "h1" || tagName === "h2" || tagName === "h3") {
    return block(wrap(`[${tagName}]`, serializeChildren(node)), context);
  }

  if (tagName === "a") {
    const href = node.getAttribute("href") ?? "#";
    return `[url=${href}]${serializeChildren(node)}[/url]`;
  }

  if (tagName === "ul" || tagName === "ol") {
    const open = tagName === "ul" ? "[list]" : "[olist]";
    const close = tagName === "ul" ? "[/list]" : "[/olist]";
    const body = serializeChildren(node).replace(/^\n+/, "").replace(/\n+$/, "\n");
    return block(`${open}\n${body}${close}`, context);
  }

  if (tagName === "li") {
    const body = serializeChildren(node).replace(/\n+$/, "");
    return `[*]${body}\n`;
  }

  if (tagName === "pre") {
    // SteamCode 容器:内部允许嵌套 block 和 inline mark,递归 serialize children 还原 BBCode
    // 末尾 \n 由 block trailing 提供,避免 [code]X\n[/code] 这种内层多余换行
    const body = serializeChildren(node).replace(/\n+$/, "");
    return block(`[code]${body}[/code]`, context);
  }

  if (tagName === "hr") {
    // 自闭合块：不加尾部 \n，由后续 <p></p> 提供换行
    return "[hr]";
  }

  if (tagName === "br") {
    return "\n";
  }

  if (tagName === "table") {
    const body = serializeChildren(node).replace(/^\n+/, "").replace(/\n{2,}/g, "\n").replace(/\n+$/, "\n");
    return block(`[table]\n${body}[/table]`, context);
  }

  if (tagName === "figure" && node.hasAttribute("data-nasge-image")) {
    // 处理 SteamImage 节点：<figure data-nasge-image>
    const previewId = node.getAttribute("data-preview-id") ?? "";
    const fileName = sanitizeFileName(node.getAttribute("data-file-name") ?? "image.png");
    const sizePreset = node.getAttribute("data-size-preset") ?? "original";
    const alignment = node.getAttribute("data-alignment") ?? "floatLeft";
    const source = node.getAttribute("data-source");
    const imageUrl = node.getAttribute("data-image-url");

    // 将内部格式转换回 BBCode 格式
    // Steam BBCode: 半宽 = sizeThumb（不是 sizeHalf）
    const sizeToken = sizePreset === "original" ? "sizeOriginal"
      : sizePreset === "full" ? "sizeFull"
      : sizePreset === "half" ? "sizeThumb"
      : "sizeOriginal";

    const alignToken = alignment === "floatLeft" ? "floatLeft"
      : alignment === "floatRight" ? "floatRight"
      : alignment === "inline" ? "inline"
      : "floatLeft";

    // screenshot 类型：[screenshot=ID;size,alignment;URL][/screenshot]
    if (source === "screenshot" && imageUrl) {
      const bbcode = `[screenshot=${previewId};${sizeToken},${alignToken};${imageUrl}][/screenshot]`;
      return block(bbcode, context);
    }

    // 普通图片：previewimg 标签
    const tagType = "previewimg";
    const bbcode = `[${tagType}=${previewId};${sizeToken},${alignToken};${fileName}][/${tagType}]`;

    // figure 等同容器块：添加尾部 \n（与 wrapTextInParagraphs 吸收的 \n 对应）
    return block(bbcode, context);
  }

  // 处理 Noparse 标签:<span data-nasge-noparse="1">
  // 内部任何字符都视为字面,即使 author 在编辑器内混入 strong 等 mark,
  // 也只取 textContent(纯文字),不递归 serialize children。
  if (tagName === "span" && node.getAttribute("data-nasge-noparse") === "1") {
    return `[noparse]${node.textContent ?? ""}[/noparse]`;
  }

  // 处理 SteamImageInline 节点：<span data-nasge-image="inline">
  if (tagName === "span" && node.getAttribute("data-nasge-image") === "inline") {
    const previewId = node.getAttribute("data-preview-id") ?? "";
    const fileName = sanitizeFileName(node.getAttribute("data-file-name") ?? "image.png");
    const sizePreset = node.getAttribute("data-size-preset") ?? "original";
    const alignment = node.getAttribute("data-alignment") ?? "inline";

    // 将内部格式转换回 BBCode 格式
    const sizeToken = sizePreset === "original" ? "sizeOriginal"
      : sizePreset === "full" ? "sizeFull"
      : sizePreset === "half" ? "sizeThumb"
      : "sizeOriginal";

    // 转换 alignment 为 BBCode token
    const alignToken = alignment === "floatLeft" ? "floatLeft"
      : alignment === "floatRight" ? "floatRight"
      : "inline";

    // Steam 官方规则：inline + sizeFull → previewimg，其他 inline 组合 → previewicon
    const tagType = (alignToken === "inline" && sizeToken === "sizeFull") ? "previewimg" : "previewicon";
    return `[${tagType}=${previewId};${sizeToken},${alignToken};${fileName}][/${tagType}]`;
  }

  if (tagName === "img") {
    const src = node.getAttribute("src") ?? "";
    return src ? `[img]${src}[/img]` : "";
  }

  if (tagName === "tr") {
    const body = serializeChildren(node).replace(/\n+$/, "");
    return `[tr]${body}[/tr]\n`;
  }

  if (tagName === "td") {
    // 去除单元格内容末尾的换行（由内部 <p> 元素产生）
    const body = serializeChildren(node).replace(/\n+$/, "");
    return `[td]${body}[/td]`;
  }

  if (tagName === "th") {
    // 去除单元格内容末尾的换行（由内部 <p> 元素产生）
    const body = serializeChildren(node).replace(/\n+$/, "");
    return `[th]${body}[/th]`;
  }

  // inline marks
  const markKey =
    tagName === "span" && node.classList.contains("nasge-spoiler")
      ? "span.nasge-spoiler"
      : tagName;
  const mark = INLINE_MARKS[markKey];
  if (mark) {
    return `${mark.open}${serializeChildren(node)}${mark.close}`;
  }

  return serializeChildren(node);
}

function serializeChildren(node: HTMLElement): string {
  const childNodes = Array.from(node.childNodes) as (HTMLElement | Text)[];
  return childNodes
    .map((child, index) =>
      serializeNode(child as HTMLElement | Text, {
        isLastSibling: index === childNodes.length - 1
      })
    )
    .join("");
}

function wrap(tag: string, content: string): string {
  const close = tag.replace("[", "[/");
  return `${tag}${content}${close}`;
}

/**
 * 将混合内容（块级元素 + 行内元素 + 文本）包装成正确的段落结构
 *
 * 核心算法：使用 lastWasBlock 状态机追踪上一个输出类型
 * - 块级元素后的第1个换行：跳过（隐含换行）
 * - 其他换行：如果有内容则刷新段落，否则输出空段落
 */
function wrapTextInParagraphs(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return html;

  const result: string[] = [];
  const paragraphBuffer: ChildNode[] = [];
  // 状态机：追踪上一个输出是否是块级元素
  // 初始设为 true，表示文档开头（不需要前导空行）
  let lastWasBlock = true;

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;

    const tempDiv = document.createElement('div');
    paragraphBuffer.forEach(node => {
      tempDiv.appendChild(node.cloneNode(true));
    });

    const content = tempDiv.innerHTML.trim();
    if (content) {
      result.push(`<p>${content}</p>`);
    }

    paragraphBuffer.length = 0;
  };

  const isBlockTag = (tagName: string) =>
    /^(p|div|h[1-6]|ul|ol|li|table|tr|td|th|blockquote|pre|hr|figure)$/i.test(tagName);

  // 自闭合块元素（hr）：Steam 不消费后续 \n（每个 \n 都渲染为 <br>）
  // 容器块元素（heading/blockquote/list/code/table/figure）：Steam 消费隐含的 \n
  const isSelfClosingBlock = (tagName: string) =>
    /^(hr)$/i.test(tagName);

  const processNode = (node: ChildNode) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      const parts = text.split('\n');

      parts.forEach((part, index) => {
        const isLastPart = index === parts.length - 1;

        if (part) {
          // 有内容：加入缓冲区
          paragraphBuffer.push(document.createTextNode(part));
        }

        if (!isLastPart) {
          // 遇到换行符（不是最后一段）
          if (paragraphBuffer.length > 0) {
            // 有内容待输出：刷新段落
            flushParagraph();
            lastWasBlock = false;
          } else if (!lastWasBlock) {
            // 无内容，且上一个不是块级：输出空段落
            result.push('<p></p>');
            // lastWasBlock 保持 false
          } else {
            // 无内容，上一个是块级：跳过（隐含换行）
            lastWasBlock = false;
          }
        }
      });

    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      const tagName = element.tagName.toLowerCase();

      if (isBlockTag(tagName)) {
        // 块级元素：先刷新缓冲区，然后输出块级元素
        flushParagraph();
        result.push(element.outerHTML);
        // 自闭合块不消费后续 \n，容器块消费
        lastWasBlock = !isSelfClosingBlock(tagName);
      } else {
        // 行内元素：加入缓冲区
        paragraphBuffer.push(element.cloneNode(true) as ChildNode);
      }
    }
  };

  Array.from(root.childNodes).forEach(processNode);

  // 刷新最后的段落
  flushParagraph();

  return result.join("");
}

/**
 * 章节标题专用 BBCode 解析（用于章节预览目录）
 * - 不解析文字格式标签（[b]、[i]、[u] 等保持原样）
 * - 解析图片 BBCode 为 <img>
 * - 如果有图片，只显示图片，忽略后面的文字
 */
export function bbcodeTitleToHtml(bbcode: string): string {
  // 类型保护：确保输入是字符串
  if (typeof bbcode !== 'string') {
    loggers.editor.warn('bbcodeTitleToHtml 收到非字符串输入', { bbcode, type: typeof bbcode });
    return String(bbcode || '');
  }

  let html = bbcode;

  // 检查是否包含图片 BBCode
  const hasImage = /\[previewicon=|\[previewimg=|\[screenshot=|\[img]/i.test(html);

  if (hasImage) {
    // Steam 图片格式：[previewicon=id;size,align;filename.png][/previewicon]
    html = html.replace(/\[previewicon=(\d+);([^;]+);([^\]]+)]\[\/previewicon]/gi, (_, id, styleStr, filename) => {
      // 优先从图片池查找透明背景 URL
      const poolUrl = getImageUrlFromPool(id);
      const url = poolUrl || `https://steamuserimages-a.akamaihd.net/ugc/${id}/${filename}`;
      return `<img src="${url}" alt="${filename}" class="nasge-chapter-preview-image" style="max-height: 40px; object-fit: contain;" />`;
    });

    // Steam 图片格式：[previewimg=id;size,align;filename.png][/previewimg]
    html = html.replace(/\[previewimg=(\d+);([^;]+);([^\]]+)]\[\/previewimg]/gi, (_, id, styleStr, filename) => {
      // 优先从图片池查找透明背景 URL
      const poolUrl = getImageUrlFromPool(id);
      const url = poolUrl || `https://steamuserimages-a.akamaihd.net/ugc/${id}/${filename}`;
      return `<img src="${url}" alt="${filename}" class="nasge-chapter-preview-image" style="max-height: 40px; object-fit: contain;" />`;
    });

    // 普通图片格式：[img]url[/img]
    html = html.replace(/\[img]([^\[]+)\[\/img]/gi, (_, url) => {
      return `<img src="${url}" alt="" class="nasge-chapter-preview-image" style="max-height: 40px; object-fit: contain;" />`;
    });

    // 如果有图片，移除图片后面的所有文字
    // 找到最后一个 </img> 或 /> 之后的内容并删除
    html = html.replace(/(<img[^>]*\/>)[\s\S]*$/, '$1');

    return html;
  }

  // 没有图片时，返回纯文本（不解析任何 BBCode）
  return bbcode;
}

/**
 * 与 Steam 一致的 inline tag 自动闭合算法
 *
 * BBCode 没有 escape 机制,孤立 [b] (没匹配 [/b]) 在浏览器渲染时由 HTML5 parser 容错
 * 在 block 边界自动闭合 inline。但 NASGE 用 DOMParser 直接解析时**不会**触发
 * 这种容错(嵌 block 的 strong 会保留嵌套结构),导致后续 H1/H2/H3 等标题被错误
 * 包入 strong,与 Steam 渲染不一致。
 *
 * 此算法在 BBCode 层模拟 Steam 行为:
 *   1. 按 block 边界 token 切分(h1-h3 / hr / list / olist / [*] / table / tr / td / th / quote / code 占位)
 *   2. 每段 inline 内容独立扫描 [b][/b][i][/i][u][/u][strike][/strike][spoiler][/spoiler] 配对
 *   3. 段末追加未匹配开标签的对应闭标签
 *   4. 不匹配的闭标签(孤立 [/b])保留原样,留给后续 replace 处理
 */
const BLOCK_BOUNDARY_RE =
  /(\[\/?h[1-3]\]|\[hr\]|\[\/?list\]|\[\/?olist\]|\[\*\]|\[table[^\]]*\]|\[\/table\]|\[\/?tr\]|\[\/?td\]|\[\/?th\]|\[quote(?:=[^\]]*)?\]|\[\/quote\]|\[code\]|\[\/code\])/gi;

const INLINE_TAG_RE = /\[(\/?)(b|i|u|strike|spoiler)\]/gi;

function autoCloseInlineAtBlockBoundary(bbcode: string): string {
  const parts = bbcode.split(BLOCK_BOUNDARY_RE);
  return parts
    .map((part, i) => {
      // split 带 capture group 时,偶数 idx 是 inline 段,奇数 idx 是 boundary token
      if (i % 2 === 1) return part;
      return closeInlineSegment(part);
    })
    .join("");
}

function closeInlineSegment(text: string): string {
  const stack: string[] = [];
  let result = "";
  let lastIdx = 0;
  // 重置 lastIndex 避免 regex 状态跨调用泄漏
  INLINE_TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_TAG_RE.exec(text)) !== null) {
    result += text.slice(lastIdx, m.index);
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    if (closing) {
      const stackIdx = stack.lastIndexOf(tag);
      if (stackIdx >= 0) {
        stack.splice(stackIdx, 1);
      }
      // 即使不匹配也保留原 token(后续 replace 会处理)
      result += m[0];
    } else {
      stack.push(tag);
      result += m[0];
    }
    lastIdx = INLINE_TAG_RE.lastIndex;
  }
  result += text.slice(lastIdx);
  // 段末按栈倒序补全未匹配开标签的闭合
  while (stack.length > 0) {
    const tag = stack.pop()!;
    result += `[/${tag}]`;
  }
  return result;
}

/**
 * 嵌套引用配对扫描(与 Steam 一致)
 *
 * Steam 行为:`[quote=A]外层[quote=B]内层[/quote]外层结尾[/quote]` 渲染为两层嵌套
 * blockquote。每个 [/quote] 闭合最近开启的 [quote],类似栈式 parser。
 *
 * 实现:inside-out 迭代,每次匹配"最内层"quote(body 不含 [quote 标签]),替换为 HTML
 * blockquote。外层 body 的内层引用已变 HTML,下轮不再被 BBCode regex 匹配,直到无
 * [quote] 可替换为止。
 */
const INNERMOST_QUOTE_RE =
  /\[quote(?:=([^\]]+))?\]((?:(?!\[\/?quote(?:=[^\]]*)?\])[\s\S])*?)\[\/quote\]/i;

function processNestedQuotes(html: string): string {
  let result = html;
  // 防御:嵌套深度上限,避免极端输入死循环
  for (let i = 0; i < 100; i++) {
    const m = result.match(INNERMOST_QUOTE_RE);
    if (!m || m.index === undefined) break;
    const author = m[1];
    const body = m[2].trim();
    const replacement = author
      ? `<blockquote class="nasge-quote" data-author="${author}">${body}</blockquote>`
      : `<blockquote class="nasge-quote">${body}</blockquote>`;
    result = result.slice(0, m.index) + replacement + result.slice(m.index + m[0].length);
  }
  return result;
}

export function bbcodeToHtml(bbcode: string, skipEscape: boolean = false): string {
  let html = bbcode;

  // [noparse] 占位 — 必须在 [code] 之前。
  // 因为 [noparse][code]X[/code][/noparse] 整体应作为字面字符串保留,
  // 让 [code] 先占位会破坏 noparse 边界。
  // noparse 内任何字符均字面,不被任何 BBCode 全局 replace 解析。
  const noparseBlocks: string[] = [];
  html = html.replace(/\[noparse]([\s\S]*?)\[\/noparse]/gi, (_, content) => {
    const idx = noparseBlocks.length;
    // HTML escape:防止字面 < > & 在 DOM parse 阶段被误识为真 HTML 元素
    const escaped = String(content)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    noparseBlocks.push(escaped);
    return `\x00NOPARSE_PLACEHOLDER_${idx}\x00`;
  });

  // 入口 escape：把 author 写在 BBCode 中的字面 < > & 转成 entity，
  // 防止后续 DOM parse 阶段把 <html> 这种字面字符串当真 HTML 元素解析。
  // 顶层调用执行；[quote] 递归调用传 skipEscape=true 避免 double-escape。
  if (!skipEscape) {
    html = html
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // 与 Steam 一致的 inline 自动闭合:孤立 [b] (没匹配 [/b]) 在 block 边界处闭合,
  // 不让 strong 跨段落延伸把后续标题包入。
  // 必须在 quote 递归 / 其他 BBCode 替换之前做(算法看 BBCode token 不看 HTML)。
  html = autoCloseInlineAtBlockBoundary(html);

  // 先处理引用 — 嵌套配对(与 Steam 一致:每个 [/quote] 闭合最近的 [quote])
  // inside-out 迭代替换:每次只匹配 body 不含 [quote/[/quote] 的最内层 quote,
  // 替换为 <blockquote>...</blockquote> 后,外层 body 内的内层引用已变 HTML 标签,
  // 不会被下一轮 INNERMOST_QUOTE_RE 匹配 → 直到没有可匹配的 [quote] 为止
  html = processNestedQuotes(html);

  // [code] 容器(与 Steam 一致:仅样式外壳,内部 BBCode 仍由后续 replace 解析)
  // 必须在 [h1] 替换之前,因为 [code][h1]X[/h1][/code] 中的 [h1] 由后续 replace 处理
  // 非贪婪匹配防止嵌套 [code] 出错
  html = html.replace(/\[code]([\s\S]*?)\[\/code]/gi, (_, content) => {
    return `<pre data-nasge-code="1" class="nasge-code">${content}</pre>`;
  });

  // 处理标题（保留标题内的换行）
  html = html.replace(/\[h1]([\s\S]*?)\[\/h1]/gi, (_, content) => {
    return `<h1>${content.replace(/\n/g, '<br />')}</h1>`;
  });
  html = html.replace(/\[h2]([\s\S]*?)\[\/h2]/gi, (_, content) => {
    return `<h2>${content.replace(/\n/g, '<br />')}</h2>`;
  });
  html = html.replace(/\[h3]([\s\S]*?)\[\/h3]/gi, (_, content) => {
    return `<h3>${content.replace(/\n/g, '<br />')}</h3>`;
  });

  // 行内格式标签
  html = html.replace(/\[b]/gi, "<strong>").replace(/\[\/b]/gi, "</strong>");
  html = html.replace(/\[i]/gi, "<em>").replace(/\[\/i]/gi, "</em>");
  html = html.replace(/\[u]/gi, "<u>").replace(/\[\/u]/gi, "</u>");
  html = html.replace(/\[strike]/gi, "<s>").replace(/\[\/strike]/gi, "</s>");
  html = html.replace(/\[spoiler]/gi, '<span class="nasge-spoiler" data-nasge-spoiler>')
    .replace(/\[\/spoiler]/gi, "</span>");

  // 列表
  html = html.replace(/\[list]/gi, "<ul>").replace(/\[\/list]/gi, "</ul>");
  html = html.replace(/\[olist]/gi, "<ol>").replace(/\[\/olist]/gi, "</ol>");
  html = html.replace(/\[\*]/gi, "<li>");

  // 分隔线
  html = html.replace(/\[hr]/gi, "<hr />");

  // 表格（支持带属性的标签，如 [table noborder=1] [table equalcells=1]）
  html = html.replace(/\[table(?:\s+[^\]]*)?]/gi, "<table>").replace(/\[\/table]/gi, "</table>");
  html = html.replace(/\[tr]/gi, "<tr>").replace(/\[\/tr]/gi, "</tr>");
  html = html.replace(/\[td]/gi, "<td>").replace(/\[\/td]/gi, "</td>");
  html = html.replace(/\[th]/gi, "<th>").replace(/\[\/th]/gi, "</th>");

  // Steam 内联图片标签 [previewicon] - 使用 span 标签，支持与文字混排
  // [previewicon=id;size,align;filename.png][/previewicon]
  html = html.replace(/\[previewicon=(\d+);([^;]+);([^\]]+)]\[\/previewicon]/gi, (_, id, styleStr, filename) => {
    const [sizeToken, alignToken] = styleStr.split(',').map((s: string) => s.trim());
    const preset = parseSizeToken(sizeToken);
    const alignment = parseAlignmentToken(alignToken);  // 保留原始 alignment

    // 使用 span 标签，标记为 inline 类型，由 SteamImageInline 节点处理
    const spanTag = `<span data-nasge-image="inline" data-preview-id="${id}" data-file-name="${filename}" data-size-preset="${preset}" data-alignment="${alignment}"></span>`;
    loggers.editor.verbose('bbcodeToHtml previewicon 转换:', { id, styleStr, filename, preset, alignment, spanTag });
    return spanTag;
  });

  // [previewimg=id;size,align;filename.png][/previewimg]
  html = html.replace(/\[previewimg=(\d+);([^;]+);([^\]]+)]\[\/previewimg]/gi, (_, id, styleStr, filename) => {
    const [sizeToken, alignToken] = styleStr.split(',').map((s: string) => s.trim());
    // 解析 size 和 alignment
    const preset = parseSizeToken(sizeToken);
    const alignment = parseAlignmentToken(alignToken);

    const figureTag = `<figure data-nasge-image="true" data-preview-id="${id}" data-file-name="${filename}" data-size-preset="${preset}" data-alignment="${alignment}"></figure>`;
    loggers.editor.verbose('bbcodeToHtml previewimg 转换:', { id, styleStr, filename, preset, alignment, figureTag });
    return figureTag;
  });

  // [screenshot=id;size,align;url][/screenshot]
  html = html.replace(/\[screenshot=([^;]+);([^;]+);([^\]]+)]\[\/screenshot]/gi, (_, id, styleStr, imageUrl) => {
    const [sizeToken, alignToken] = styleStr.split(',').map((s: string) => s.trim());
    const preset = parseSizeToken(sizeToken);
    const alignment = parseAlignmentToken(alignToken);

    const figureTag = `<figure data-nasge-image="true" data-preview-id="${id}" data-file-name="" data-size-preset="${preset}" data-alignment="${alignment}" data-source="screenshot" data-image-url="${imageUrl}"></figure>`;
    loggers.editor.verbose('bbcodeToHtml screenshot 转换:', { id, styleStr, imageUrl, preset, alignment });
    return figureTag;
  });

  // 链接：Steam 支持两种形式
  // [url=https://example.com]label[/url] — 命名形式
  // [url]https://example.com[/url] — 自动取 URL 做 label
  // 注意：bare url 形式必须先于命名形式的 [/url] 替换处理
  html = html.replace(/\[url]([^\[]+)\[\/url]/gi, (_, url) => `<a href="${url}">${url}</a>`);
  html = html.replace(/\[url=([^\]]+)]/gi, '<a href="$1">').replace(/\[\/url]/gi, "</a>");
  html = html.replace(/\[img]/gi, '<img src="').replace(/\[\/img]/gi, '" alt="" class="nasge-image" />');

  // 还原 [noparse] 占位符为 <span data-nasge-noparse="1">字面字符串</span>(inline 元素)
  // 内容已 HTML escape,DOM parse 时 entity 解码,textContent 拿到 author 原字面
  html = html.replace(/\x00NOPARSE_PLACEHOLDER_(\d+)\x00/g, (_, idx) => {
    return `<span data-nasge-noparse="1">${noparseBlocks[parseInt(idx, 10)]}</span>`;
  });

  // 检查是否有块级元素
  const hasBlock = /<(ul|ol|table|h[1-3]|pre|hr|blockquote|figure)/i.test(html);
  if (hasBlock) {
    // 有块级元素时，使用 wrapTextInParagraphs 处理混合内容
    // 确保块级元素外的文本正确包装成段落，并保留换行
    return wrapTextInParagraphs(html);
  }

  const paragraphs: string[] = [];
  let buffer = "";
  let index = 0;

  while (index < html.length) {
    const char = html[index];

    if (char === "\n") {
      let count = 1;
      while (index + count < html.length && html[index + count] === "\n") {
        count++;
      }

      if (buffer.length > 0) {
        paragraphs.push(buffer);
        buffer = "";
        const extraBlankCount = Math.max(0, count - 1);
        if (extraBlankCount > 0) {
          for (let blankIndex = 0; blankIndex < extraBlankCount; blankIndex++) {
            paragraphs.push("");
          }
        }
      } else {
        for (let blankIndex = 0; blankIndex < count; blankIndex++) {
          paragraphs.push("");
        }
      }

      index += count;
      continue;
    }

    buffer += char;
    index += 1;
  }

  if (buffer.length > 0 || !paragraphs.length) {
    paragraphs.push(buffer);
  }

  return paragraphs
    .map((paragraph) => {
      if (!paragraph.trim()) {
        return "<p></p>";  // 空段落不加 br，让 TipTap 自己处理
      }
      return `<p>${paragraph.replace(/\n/g, "<br />")}</p>`;
    })
    .join("");
}

