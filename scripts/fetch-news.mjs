#!/usr/bin/env node
// Fetch the allowlisted feeds in data/sources.json and write data/news.json.
// Runs on GitHub Actions (free for public repositories). No dependencies,
// no API keys, no paid services.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { matchesScripts, parseFeed, parseTrendsFeed, stripPublisherSuffix, truncate } from "./lib/rss.mjs";
import { articleFingerprint, canonicalizeUrl, dedupeArticles } from "./lib/dedupe.mjs";
import { computeTrends } from "./lib/trends.mjs";
import { collectFigure } from "./lib/figures.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES_FILE = process.env.WR_SOURCES_FILE || join(ROOT, "data", "sources.json");
const OUTPUT_FILE = process.env.WR_OUTPUT_FILE || join(ROOT, "data", "news.json");
const FIGURES_FILE = process.env.WR_FIGURES_FILE || join(ROOT, "data", "figures.json");

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_PER_SOURCE = 20;
const MAX_AGE_HOURS = 48;
const MAX_TOTAL = 1600;
const TRENDS_PER_COUNTRY = 12;
const STATEMENT_DAYS = { post: 7, video: 7, quote: 3 };
const MAX_STATEMENTS = 400;
const CONCURRENCY = 8;
const USER_AGENT = "WorldRadarBot/1.0 (+https://github.com/marwaragabmw11-tech/world-radar)";

async function readBody(res) {
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared > MAX_BYTES) throw new Error(`too large (${declared} bytes)`);
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new Error("response exceeded size limit");
    }
    chunks.push(value);
  }
  return decodeXml(Buffer.concat(chunks));
}

/**
 * Decode feed bytes. UTF-8 first: some servers (often ASP.NET) declare
 * encoding="utf-16" while actually sending UTF-8. Only fall back to the
 * declared legacy encoding when UTF-8 decoding clearly fails.
 */
export function decodeXml(buf) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf);
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder("utf-16be").decode(buf);
  const utf8 = new TextDecoder("utf-8").decode(buf);
  const head = buf.subarray(0, 200).toString("latin1");
  const enc = head.match(/encoding=["']([\w-]+)["']/i)?.[1]?.toLowerCase();
  const broken = (utf8.match(/\uFFFD/g) || []).length > 5;
  if (broken && enc && !/^utf-?(8|16)/.test(enc)) {
    try { return new TextDecoder(enc).decode(buf); } catch { /* keep UTF-8 */ }
  }
  return utf8;
}

const ACCEPT = "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5";

async function download(url, { plain = false } = {}) {
  const headers = plain ? { "user-agent": USER_AGENT } : { "user-agent": USER_AGENT, accept: ACCEPT };
  const res = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!/^https?:$/.test(new URL(res.url).protocol)) throw new Error("redirected to a non-HTTP URL");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return readBody(res);
}

const errorText = (err) =>
  String(err?.name === "TimeoutError" ? "timeout" : err?.message || err).slice(0, 160);

async function fetchSource(source) {
  const started = Date.now();
  const status = { id: source.id, ok: false, items: 0, ms: 0, error: null };
  try {
    let parsed;
    try {
      parsed = parseFeed(await download(source.url));
      if (!parsed.length) throw new Error("no items parsed");
    } catch {
      // One retry with minimal headers: a few servers answer differently to an Accept header.
      parsed = parseFeed(await download(source.url, { plain: true }));
    }
    const now = Date.now();
    const items = parsed
      .filter((it) => !it.publishedAt || it.publishedAt.getTime() <= now + 3600_000)
      .slice(0, MAX_PER_SOURCE)
      .map((it) => {
        const title = source.via === "google-news"
          ? stripPublisherSuffix(it.title, [it.sourceName, source.name])
          : it.title;
        return {
          id: articleFingerprint({ canonicalUrl: it.link, title }),
          sourceId: source.id,
          lang: source.lang,
          title: truncate(title, 300),
          excerpt: source.via === "google-news" || it.excerpt === it.title ? "" : truncate(it.excerpt, 240),
          url: it.link,
          publishedAt: it.publishedAt ? it.publishedAt.toISOString() : null,
          fetchedAt: new Date(now).toISOString()
        };
      });
    if (items.length === 0) throw new Error("no items parsed");
    status.ok = true;
    status.items = items.length;
    return { status, items };
  } catch (err) {
    status.error = errorText(err);
    return { status, items: [] };
  } finally {
    status.ms = Date.now() - started;
  }
}

async function fetchSearchTrends(conf) {
  try {
    const xml = await download(conf.url);
    const items = parseTrendsFeed(xml)
      .filter((t) => matchesScripts(t.term, conf.scripts))
      .sort((a, b) => b.value - a.value)
      .slice(0, TRENDS_PER_COUNTRY)
      .map((t) => ({ term: t.term, traffic: t.traffic, value: t.value }));
    if (!items.length) throw new Error("no trends parsed");
    return { country: conf.country, hl: conf.hl, ok: true, items };
  } catch (err) {
    return { country: conf.country, hl: conf.hl, ok: false, error: errorText(err), items: [] };
  }
}

async function mapLimit(list, limit, fn) {
  const results = new Array(list.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, list.length) }, async () => {
      while (next < list.length) {
        const i = next++;
        results[i] = await fn(list[i]);
      }
    })
  );
  return results;
}

async function loadPrevious() {
  try {
    const prev = JSON.parse(await readFile(OUTPUT_FILE, "utf8"));
    return prev.demo ? {} : prev;
  } catch {
    return {};
  }
}

async function main() {
  const { sources, searchTrends: trendConfs = [] } = JSON.parse(await readFile(SOURCES_FILE, "utf8"));
  let figures = [];
  try { figures = JSON.parse(await readFile(FIGURES_FILE, "utf8")).figures || []; } catch { /* optional */ }
  const [results, trendResults, figureResults] = await Promise.all([
    mapLimit(sources, CONCURRENCY, fetchSource),
    mapLimit(trendConfs, 4, fetchSearchTrends),
    mapLimit(figures, 4, (f) => collectFigure(f, download))
  ]);
  const previous = await loadPrevious();
  const prevArticles = Array.isArray(previous.articles) ? previous.articles : [];
  const knownIds = new Set(sources.map((s) => s.id));

  // Undated items (some feeds omit dates) keep the time we first saw them,
  // so they don't jump back to the top on every run.
  const firstSeen = new Map(prevArticles.map((a) => [canonicalizeUrl(a.url), a.fetchedAt]));
  const fresh = results.flatMap((r) => r.items).map((a) =>
    a.publishedAt ? a : { ...a, fetchedAt: firstSeen.get(canonicalizeUrl(a.url)) || a.fetchedAt }
  );

  const cutoff = Date.now() - MAX_AGE_HOURS * 3600_000;
  const timeOf = (a) => Date.parse(a.publishedAt || a.fetchedAt);
  const perSource = new Map();
  const merged = dedupeArticles([...fresh, ...prevArticles.filter((a) => knownIds.has(a.sourceId))])
    .filter((a) => timeOf(a) >= cutoff)
    .sort((a, b) => timeOf(b) - timeOf(a))
    .filter((a) => {
      const n = (perSource.get(a.sourceId) || 0) + 1;
      perSource.set(a.sourceId, n);
      return n <= MAX_PER_SOURCE * 2; // this hour's items plus recently seen ones
    })
    .slice(0, MAX_TOTAL);

  // If a trends feed fails this hour, keep the last good list.
  const prevTrends = previous.searchTrends || {};
  const searchTrends = {};
  for (const t of trendResults) {
    searchTrends[t.country] = t.ok
      ? { ...t, updatedAt: new Date().toISOString() }
      : prevTrends[t.country]?.ok
        ? { ...prevTrends[t.country], stale: true }
        : t;
  }

  // Words repeating in each country's local headlines (in its main language).
  const localTrends = {};
  for (const country of new Set(sources.filter((s) => s.section === "local").map((s) => s.country))) {
    const ids = new Set(sources.filter((s) => s.section === "local" && s.country === country).map((s) => s.id));
    const arts = merged.filter((a) => ids.has(a.sourceId));
    const byLang = computeTrends(arts);
    const counts = {};
    for (const a of arts) counts[a.lang] = (counts[a.lang] || 0) + 1;
    const main = Object.keys(counts).sort((x, y) => counts[y] - counts[x])[0];
    if (main && byLang[main]?.length) localTrends[country] = { lang: main, items: byLang[main] };
  }

  // Public statements: keep earlier ones too, so a channel that fails this hour keeps its posts.
  const now = Date.now();
  const prevStatements = Array.isArray(previous.statements) ? previous.statements : [];
  const figureIds = new Set(figures.map((f) => f.id));
  const seenStatements = new Set();
  const statements = [...figureResults.flatMap((r) => r.items), ...prevStatements]
    .filter((st) => figureIds.has(st.figureId))
    .filter((st) => {
      const key = st.id;
      if (seenStatements.has(key)) return false;
      seenStatements.add(key);
      const t = Date.parse(st.publishedAt || "");
      return Number.isFinite(t) && now - t <= (STATEMENT_DAYS[st.kind] || 3) * 86400_000 && t <= now + 3600_000;
    })
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, MAX_STATEMENTS);

  const okCount = results.filter((r) => r.status.ok).length;
  const output = {
    generatedAt: new Date().toISOString(),
    demo: false,
    stats: { articles: merged.length, sourcesOk: okCount, sourcesTotal: sources.length },
    sources: sources.map((s, i) => ({
      id: s.id, name: s.name, lang: s.lang, home: s.home,
      country: s.country, section: s.section,
      ...(s.leaning ? { leaning: s.leaning } : {}),
      ...(s.via ? { via: s.via } : {}),
      ...results[i].status
    })),
    trends: computeTrends(merged),
    searchTrends,
    localTrends,
    figures: figures.map((f, i) => ({
      id: f.id, name: f.name, role: f.role, party: f.party || null, country: f.country,
      channels: figureResults[i].status.channels, quotes: figureResults[i].status.quotes
    })),
    statements,
    articles: merged
  };

  await writeFile(OUTPUT_FILE, JSON.stringify(output) + "\n");
  for (const r of results) {
    console.log(`${r.status.ok ? "✓" : "✗"} ${r.status.id.padEnd(20)} ${String(r.status.items).padStart(3)} items ${r.status.ms}ms ${r.status.error ?? ""}`);
  }
  for (const t of trendResults) {
    console.log(`${t.ok ? "✓" : "✗"} trends-${t.country.padEnd(13)} ${String(t.items.length).padStart(3)} terms ${t.error ?? t.items.slice(0, 3).map((x) => x.term).join(" · ")}`);
  }
  for (const r of figureResults) {
    const ch = r.status.channels.map((c) => `${c.type}:${c.handle || c.label}=${c.ok ? c.posts : "✗"}`).join(" ");
    console.log(`• ${r.status.id.padEnd(12)} quotes=${r.status.quotes} ${ch}${r.status.quotesError ? " news✗ " + r.status.quotesError : ""}`);
  }
  console.log(`\n${merged.length} articles from ${okCount}/${sources.length} sources, ${statements.length} statements → data/news.json`);
  if (okCount === 0) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
