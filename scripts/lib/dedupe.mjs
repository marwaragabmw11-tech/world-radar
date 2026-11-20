import { createHash } from "node:crypto";

export function normalizeHeadline(value) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "") // Arabic diacritics
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const TRACKING_PARAMS = /^(utm_|at_|ns_|ref$|ocid$|cmp$|fbclid$|gclid$|xtor$)/i;

export function canonicalizeUrl(raw) {
  try {
    const url = new URL(raw.trim());
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase();
    let out = url.toString();
    if (out.endsWith("/") && url.pathname !== "/") out = out.slice(0, -1);
    return out;
  } catch {
    return raw.trim();
  }
}

export function articleFingerprint({ canonicalUrl, title }) {
  return createHash("sha256")
    .update(`${canonicalizeUrl(canonicalUrl).replace(/^http:/, "https:")}\n${normalizeHeadline(title)}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Remove duplicates: same canonical URL, or the same normalized headline
 * in the same language (syndicated copies). Keeps the first occurrence.
 */
export function dedupeArticles(articles) {
  const seenUrls = new Set();
  const seenTitles = new Set();
  const out = [];
  for (const a of articles) {
    const url = canonicalizeUrl(a.url);
    const urlKey = url.replace(/^http:/, "https:");
    const titleKey = `${a.lang}:${normalizeHeadline(a.title)}`;
    if (seenUrls.has(urlKey) || seenTitles.has(titleKey)) continue;
    seenUrls.add(urlKey);
    seenTitles.add(titleKey);
    out.push({ ...a, url });
  }
  return out;
}
