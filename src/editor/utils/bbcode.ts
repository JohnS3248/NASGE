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

export function bbcodeToHtml(bbcode: string): string {
  let html = bbcode;
  html = html.replace(/\[quote=([^\]]+)]([\s\S]*?)\[\/quote]/gi, (_, author, body) => {
    const inner = bbcodeToHtml(body.trim());
    return `<blockquote class="nasge-quote" data-author="${author}">${inner}</blockquote>`;
  });

  html = html.replace(/\[quote]([\s\S]*?)\[\/quote]/gi, (_, body) => {
    const inner = bbcodeToHtml(body.trim());
    return `<blockquote class="nasge-quote">${inner}</blockquote>`;
  });

  html = html.replace(/\[b]/gi, "<strong>").replace(/\[\/b]/gi, "</strong>");
  html = html.replace(/\[i]/gi, "<em>").replace(/\[\/i]/gi, "</em>");
  html = html.replace(/\[u]/gi, "<u>").replace(/\[\/u]/gi, "</u>");
  html = html.replace(/\[strike]/gi, "<s>").replace(/\[\/strike]/gi, "</s>");
  html = html.replace(/\[spoiler]/gi, '<span class="nasge-spoiler" data-nasge-spoiler>')
    .replace(/\[\/spoiler]/gi, "</span>");
  html = html.replace(/\[h1]/gi, "<h1>").replace(/\[\/h1]/gi, "</h1>");
  html = html.replace(/\[h2]/gi, "<h2>").replace(/\[\/h2]/gi, "</h2>");
  html = html.replace(/\[h3]/gi, "<h3>").replace(/\[\/h3]/gi, "</h3>");
  html = html.replace(/\[list]/gi, "<ul>").replace(/\[\/list]/gi, "</ul>");
  html = html.replace(/\[olist]/gi, "<ol>").replace(/\[\/olist]/gi, "</ol>");
  html = html.replace(/\[\*]/gi, "<li>");
  html = html.replace(/\[code]/gi, "<pre><code>").replace(/\[\/code]/gi, "</code></pre>");
  html = html.replace(/\[hr]/gi, "<hr />");
  html = html.replace(/\[table]/gi, "<table>").replace(/\[\/table]/gi, "</table>");
  html = html.replace(/\[tr]/gi, "<tr>").replace(/\[\/tr]/gi, "</tr>");
  html = html.replace(/\[td]/gi, "<td>").replace(/\[\/td]/gi, "</td>");
  html = html.replace(/\[th]/gi, "<th>").replace(/\[\/th]/gi, "</th>");

  // Links
  html = html.replace(/\[url=([^\]]+)]/gi, '<a href="$1">').replace(/\[\/url]/gi, "</a>");
  html = html.replace(/\[img]/gi, '<img src="').replace(/\[\/img]/gi, '" alt="" class="nasge-image" />');
  const hasBlock = /<(ul|ol|table|h[1-3]|pre|hr|blockquote)/i.test(html);
  if (hasBlock) {
    return html;
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
