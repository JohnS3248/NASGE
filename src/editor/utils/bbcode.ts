import { useSteamGuideImageStore } from '../stores/useSteamGuideImageStore';

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

  console.log('[bbcodeToHtml DEBUG] 查找图片:', {
    previewId,
    imagePoolSize: imagePool.length,
    imagePoolPreviewIds: imagePool.map(img => img.previewId)
  });

  const image = imagePool.find(img => img.previewId === previewId);

  console.log('[bbcodeToHtml DEBUG] 查找结果:', {
    previewId,
    found: !!image,
    imageData: image ? {
      previewId: image.previewId,
      fileName: image.fileName,
      hasOriginalUrl: !!image.originalUrl,
      hasThumbnailUrl: !!image.thumbnailUrl,
      originalUrl: image.originalUrl,
      thumbnailUrl: image.thumbnailUrl
    } : null
  });

  if (image?.originalUrl) {
    console.log('[bbcodeToHtml] ✅ 从图片池找到透明图片:', { previewId, url: image.originalUrl });
    return image.originalUrl;
  }

  console.warn('[bbcodeToHtml] ❌ 图片池中未找到 previewId:', previewId, '或 originalUrl 为空');
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
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+$/, "");
}

function serializeNode(node: HTMLElement | Text, context: SerializeContext): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
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
    const author = node.getAttribute("data-author") ?? "";
    const childNodes = Array.from(node.childNodes) as (HTMLElement | Text)[];
    const filtered = childNodes.filter((child, index) => {
      if (author && index === 0 && child instanceof HTMLElement && child.tagName.toLowerCase() === "p") {
        const text = child.textContent?.trim() ?? "";
        return !text.startsWith(`引用自 ${author}`);
      }
      return true;
    });
    const body = filtered
      .map((child, index) =>
        serializeNode(child as any, {
          isLastSibling: index === filtered.length - 1
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
    const body = serializeChildren(node).replace(/\n+$/, "\n");
    return block(`${open}\n${body}${close}`, context);
  }

  if (tagName === "li") {
    const body = serializeChildren(node).replace(/\n+$/, "");
    return `[*]${body}\n`;
  }

  if (tagName === "pre") {
    const code = node.textContent ?? "";
    return block(`[code]${code.replace(/\n$/, "")}[/code]`, context);
  }

  if (tagName === "hr") {
    return block("[hr]", context);
  }

  if (tagName === "br") {
    return "\n";
  }

  if (tagName === "table") {
    const body = serializeChildren(node).replace(/\n+$/, "\n");
    return block(`[table]\n${body}[/table]`, context);
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
    return `[td]${serializeChildren(node)}[/td]`;
  }

  if (tagName === "th") {
    return `[th]${serializeChildren(node)}[/th]`;
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

function wrapTextInParagraphs(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return html;

  const result: string[] = [];
  const paragraphBuffer: ChildNode[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;

    // 创建临时容器来渲染段落内容
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

  const processNode = (node: ChildNode) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";

      // 检查是否在块级元素之间的空白
      const prevSibling = node.previousSibling;
      const nextSibling = node.nextSibling;

      const prevIsBlock = prevSibling?.nodeType === Node.ELEMENT_NODE &&
        /^(p|div|h[1-6]|ul|ol|li|table|tr|td|th|blockquote|pre|hr)$/i.test((prevSibling as Element).tagName);
      const nextIsBlock = nextSibling?.nodeType === Node.ELEMENT_NODE &&
        /^(p|div|h[1-6]|ul|ol|li|table|tr|td|th|blockquote|pre|hr)$/i.test((nextSibling as Element).tagName);

      if ((prevIsBlock || nextIsBlock) && !text.trim()) {
        return;
      }

      // 按换行符分割文本，每个换行符创建新段落
      const lines = text.split('\n');
      lines.forEach((line, index) => {
        if (line) {
          // 添加文本节点到当前段落
          paragraphBuffer.push(document.createTextNode(line));
        }

        // 如果不是最后一行，刷新当前段落并开始新段落
        if (index < lines.length - 1) {
          flushParagraph();
        }
      });

    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      const tagName = element.tagName.toLowerCase();

      const isBlock = /^(p|div|h[1-6]|ul|ol|li|table|tr|td|th|blockquote|pre|hr)$/.test(tagName);

      if (isBlock) {
        // 遇到块级元素，先刷新当前段落
        flushParagraph();
        // 添加块级元素本身
        result.push(element.outerHTML);
      } else {
        // 行内元素，添加到当前段落缓冲区
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
    console.warn('[bbcodeTitleToHtml] 收到非字符串输入', { bbcode, type: typeof bbcode });
    return String(bbcode || '');
  }

  let html = bbcode;

  // 检查是否包含图片 BBCode
  const hasImage = /\[previewicon=|\[previewimg=|\[img]/i.test(html);

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

export function bbcodeToHtml(bbcode: string): string {
  let html = bbcode;

  // 先处理引用（递归转换）
  html = html.replace(/\[quote=([^\]]+)]([\s\S]*?)\[\/quote]/gi, (_, author, body) => {
    const inner = bbcodeToHtml(body.trim());
    return `<blockquote class="nasge-quote" data-author="${author}"><p>引用自 ${author}：</p>${inner}</blockquote>`;
  });

  html = html.replace(/\[quote]([\s\S]*?)\[\/quote]/gi, (_, body) => {
    const inner = bbcodeToHtml(body.trim());
    return `<blockquote class="nasge-quote">${inner}</blockquote>`;
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

  // 代码块
  html = html.replace(/\[code]/gi, "<pre><code>").replace(/\[\/code]/gi, "</code></pre>");

  // 分隔线
  html = html.replace(/\[hr]/gi, "<hr />");

  // 表格
  html = html.replace(/\[table]/gi, "<table>").replace(/\[\/table]/gi, "</table>");
  html = html.replace(/\[tr]/gi, "<tr>").replace(/\[\/tr]/gi, "</tr>");
  html = html.replace(/\[td]/gi, "<td>").replace(/\[\/td]/gi, "</td>");
  html = html.replace(/\[th]/gi, "<th>").replace(/\[\/th]/gi, "</th>");

  // 链接和图片
  html = html.replace(/\[url=([^\]]+)]/gi, '<a href="$1">').replace(/\[\/url]/gi, "</a>");
  html = html.replace(/\[img]/gi, '<img src="').replace(/\[\/img]/gi, '" alt="" class="nasge-image" />');

  // 检查是否有块级元素
  const hasBlock = /<(ul|ol|table|h[1-3]|pre|hr|blockquote)/i.test(html);
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
        const extraBlankCount = Math.max(0, count - 2);
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
        return "<p><br /></p>";
      }
      return `<p>${paragraph.replace(/\n/g, "<br />")}</p>`;
    })
    .join("");
}
