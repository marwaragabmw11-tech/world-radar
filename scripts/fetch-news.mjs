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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES_FILE = process.env.WR_SOURCES_FILE || join(ROOT, "data", "sources.json");
const OUTPUT_FILE = process.env.WR_OUTPUT_FILE || join(ROOT, "data", "news.json");

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_PER_SOURCE = 20;
const MAX_AGE_HOURS = 48;
const MAX_TOTAL = 1600;
const TRENDS_PER_COUNTRY = 12;
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
  const buf = Buffer.concat(chunks);
  // Respect a declared XML encoding when it isn't UTF-8 (rare for these feeds).
  const head = buf.subarray(0, 200).toString("latin1");
  const enc = head.match(/encoding=["']([\w-]+)["']/i)?.[1]?.toLowerCase();
  if (enc && enc !== "utf-8" && enc !== "utf8") {
    try { return new TextDecoder(enc).decode(buf); } catch { /* fall through */ }
  }
  return new TextDecoder("utf-8").decode(buf);
}

async function download(url) {
  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5" },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
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
    const xml = await download(source.url);
    const now = Date.now();
    const items = parseFeed(xml)
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
  const [results, trendResults] = await Promise.all([
    mapLimit(sources, CONCURRENCY, fetchSource),
    mapLimit(trendConfs, 4, fetchSearchTrends)
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
    articles: merged
  };

  await writeFile(OUTPUT_FILE, JSON.stringify(output) + "\n");
  for (const r of results) {
    console.log(`${r.status.ok ? "✓" : "✗"} ${r.status.id.padEnd(20)} ${String(r.status.items).padStart(3)} items ${r.status.ms}ms ${r.status.error ?? ""}`);
  }
  for (const t of trendResults) {
    console.log(`${t.ok ? "✓" : "✗"} trends-${t.country.padEnd(13)} ${String(t.items.length).padStart(3)} terms ${t.error ?? t.items.slice(0, 3).map((x) => x.term).join(" · ")}`);
  }
  console.log(`\n${merged.length} articles from ${okCount}/${sources.length} sources → data/news.json`);
  if (okCount === 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
