/**
 * Sanitises admin-authored HTML before it is injected into the till.
 *
 * Allow-list approach: unknown elements are unwrapped (children kept), dangerous
 * containers are dropped with their content, every `on*` / `style`-free
 * attribute outside a small allow-list is removed, and URLs must be http(s),
 * mailto or tel. Needs a DOM (DOMParser); returns "" when none is available so
 * nothing unsanitised is ever rendered (e.g. on the server).
 */

const DROP_WITH_CONTENT = new Set([
  "script", "style", "iframe", "object", "embed", "form", "link", "meta",
  "base", "noscript", "template", "svg", "math", "applet", "frame", "frameset",
  "input", "button", "textarea", "select", "audio", "video", "canvas",
]);

const ALLOWED_TAGS = new Set([
  "a", "b", "strong", "i", "em", "u", "s", "br", "hr", "p", "div", "span",
  "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "pre",
  "code", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
  "sub", "sup", "small", "mark", "img",
]);

const ALLOWED_ATTRS = new Set([
  "href", "src", "alt", "title", "colspan", "rowspan", "align", "start",
]);

const SAFE_URL = /^(https?:|mailto:|tel:|data:image\/(png|jpe?g|gif|webp);|#|\/|\.)/i;

const isSafeUrl = (value: string): boolean => {
  // Browsers ignore whitespace/control characters inside the scheme.
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000- \u007f-\u009f]/g, "");
  if (!cleaned) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(cleaned)) return SAFE_URL.test(cleaned);
  return true; // relative reference
};

const clean = (parent: Node): void => {
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === 3) continue; // text
    if (node.nodeType !== 1) {
      parent.removeChild(node); // comments, processing instructions
      continue;
    }
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (DROP_WITH_CONTENT.has(tag)) {
      parent.removeChild(el);
      continue;
    }
    clean(el);
    if (!ALLOWED_TAGS.has(tag)) {
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (
        name.startsWith("on") ||
        !ALLOWED_ATTRS.has(name) ||
        ((name === "href" || name === "src") && !isSafeUrl(attr.value))
      ) {
        el.removeAttribute(attr.name);
      }
    }
    if (tag === "a" && el.getAttribute("href")) {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    }
  }
};

export const sanitizeHtml = (html: string): string => {
  if (!html || typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  clean(doc.body);
  return doc.body.innerHTML;
};
