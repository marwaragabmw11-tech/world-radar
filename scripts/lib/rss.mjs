// Minimal, dependency-free RSS 2.0 / RSS 1.0 (RDF) / Atom parser.
// It only extracts the fields World Radar needs and never executes feed content.

const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’",
  ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", copy: "©", reg: "®"
};

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

function unwrapCdata(text) {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

/** Turn a fragment of (possibly HTML) feed text into clean plain text. */
export function toPlainText(raw) {
  if (!raw) return "";
  let text = unwrapCdata(raw);
  // Feeds often double-encode HTML (&lt;p&gt;), so decode first, then strip tags.
  text = decodeEntities(text);
  text = text
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?[a-z][^>]*>/gi, " ");
  text = decodeEntities(text);
  return text.replace(/\s+/g, " ").trim();
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Inner text of the first matching tag (namespaced names like dc:date supported). */
function tagText(block, names) {
  for (const name of names) {
    const re = new RegExp(`<${escapeRe(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapeRe(name)}>`, "i");
    const m = block.match(re);
    if (m && m[1].trim()) return m[1];
  }
  return "";
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return m ? decodeEntities(m[2] ?? m[3] ?? "") : "";
}

function atomLink(block) {
  const links = block.match(/<link\b[^>]*\/?>/gi) || [];
  let fallback = "";
  for (const l of links) {
    const href = attr(l, "href");
    if (!href) continue;
    const rel = attr(l, "rel");
    if (!rel || rel === "alternate") return href;
    if (!fallback) fallback = href;
  }
  return fallback;
}

function itemLink(block) {
  const text = toPlainText(tagText(block, ["link"]));
  if (/^https?:\/\//i.test(text)) return text;
  const atom = atomLink(block);
  if (atom) return atom;
  const guid = block.match(/<guid\b([^>]*)>([\s\S]*?)<\/guid>/i);
  if (guid && !/isPermaLink\s*=\s*["']false["']/i.test(guid[1])) {
    const g = toPlainText(guid[2]);
    if (/^https?:\/\//i.test(g)) return g;
  }
  const about = block.match(/<item\b[^>]*rdf:about\s*=\s*"([^"]+)"/i);
  return about ? decodeEntities(about[1]) : "";
}

function parseDate(raw) {
  const text = toPlainText(raw);
  if (!text) return null;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Parse an RSS/Atom document into raw items.
 * @returns {{title:string, link:string, excerpt:string, publishedAt:Date|null}[]}
 */
export function parseFeed(xml) {
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  const items = [];
  for (const block of blocks) {
    const title = toPlainText(tagText(block, ["title"]));
    const link = itemLink(block).trim();
    if (!title || !/^https?:\/\//i.test(link)) continue;
    const excerpt = toPlainText(
      tagText(block, ["description", "summary", "content:encoded", "content"])
    );
    const publishedAt = parseDate(
      tagText(block, ["pubDate", "dc:date", "published", "updated", "a10:updated"])
    );
    items.push({ title, link, excerpt, publishedAt });
  }
  return items;
}

/** Shorten text at a word boundary without cutting mid-word where possible. */
export function truncate(text, max = 240) {
  if (!text || text.length <= max) return text || "";
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trim() + "…";
}
