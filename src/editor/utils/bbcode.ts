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

export function htmlToBBCode(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";
  return Array.from(root.childNodes)
    .map((node) => serializeNode(node as HTMLElement | Text))
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function serializeNode(node: HTMLElement | Text): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }

  if (!(node instanceof HTMLElement)) return "";

  const tagName = node.tagName.toLowerCase();

  if (tagName === "p") {
    return `${serializeChildren(node)}\n\n`;
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
    const body = filtered.map((child) => serializeNode(child as any)).join("").trim();
    return author ? `[quote=${author}]${body}[/quote]\n\n` : `[quote]${body}[/quote]\n\n`;
  }

  if (tagName === "h1" || tagName === "h2" || tagName === "h3") {
    return wrap(`[${tagName}]`, serializeChildren(node));
  }

  if (tagName === "a") {
    const href = node.getAttribute("href") ?? "#";
    return `[url=${href}]${serializeChildren(node)}[/url]`;
  }

  if (tagName === "ul" || tagName === "ol") {
    const open = tagName === "ul" ? "[list]" : "[olist]";
    const close = tagName === "ul" ? "[/list]" : "[/olist]";
    return `${open}${serializeChildren(node)}${close}`;
  }

  if (tagName === "li") {
    return `[*]${serializeChildren(node)}`;
  }

  if (tagName === "pre") {
    const code = node.textContent ?? "";
    return `[code]${code.replace(/\n$/, "")}[/code]`;
  }

  if (tagName === "hr") {
    return "[hr]";
  }

  if (tagName === "table") {
    return `[table]${serializeChildren(node)}[/table]`;
  }

  if (tagName === "img") {
    const src = node.getAttribute("src") ?? "";
    return src ? `[img]${src}[/img]` : "";
  }

  if (tagName === "tr") {
    return `[tr]${serializeChildren(node)}[/tr]`;
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
  return Array.from(node.childNodes)
    .map((child) => serializeNode(child as HTMLElement | Text))
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
  const hasBlock = /<(ul|ol|table|h[1-3]|pre|hr)/i.test(html);
  if (hasBlock) {
    return html;
  }

  const normalized = html
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${block}</p>`)
    .join("");

  return normalized || `<p>${html}</p>`;
}
