#!/usr/bin/env node
// Fetch the allowlisted feeds in data/sources.json and write data/news.json.
// Runs on GitHub Actions (free for public repositories). No dependencies,
// no API keys, no paid services.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseFeed, truncate } from "./lib/rss.mjs";
import { articleFingerprint, dedupeArticles } from "./lib/dedupe.mjs";
import { computeTrends } from "./lib/trends.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES_FILE = process.env.WR_SOURCES_FILE || join(ROOT, "data", "sources.json");
const OUTPUT_FILE = process.env.WR_OUTPUT_FILE || join(ROOT, "data", "news.json");

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_PER_SOURCE = 25;
const MAX_AGE_HOURS = 48;
const MAX_TOTAL = 700;
const CONCURRENCY = 6;
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

async function fetchSource(source) {
  const started = Date.now();
  const status = { id: source.id, ok: false, items: 0, ms: 0, error: null };
  try {
    const res = await fetch(source.url, {
      headers: { "user-agent": USER_AGENT, accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!/^https?:$/.test(new URL(res.url).protocol)) throw new Error("redirected to a non-HTTP URL");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await readBody(res);
    const now = Date.now();
    const items = parseFeed(xml)
      .filter((it) => !it.publishedAt || it.publishedAt.getTime() <= now + 3600_000)
      .slice(0, MAX_PER_SOURCE)
      .map((it) => ({
        id: articleFingerprint({ canonicalUrl: it.link, title: it.title }),
        sourceId: source.id,
        lang: source.lang,
        title: truncate(it.title, 300),
        excerpt: truncate(it.excerpt === it.title ? "" : it.excerpt, 240),
        url: it.link,
        publishedAt: it.publishedAt ? it.publishedAt.toISOString() : null,
        fetchedAt: new Date(now).toISOString()
      }));
    if (items.length === 0) throw new Error("no items parsed");
    status.ok = true;
    status.items = items.length;
    return { status, items };
  } catch (err) {
    status.error = String(err?.name === "TimeoutError" ? "timeout" : err?.message || err).slice(0, 160);
    return { status, items: [] };
  } finally {
    status.ms = Date.now() - started;
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
    return Array.isArray(prev.articles) && !prev.demo ? prev.articles : [];
  } catch {
    return [];
  }
}

async function main() {
  const { sources } = JSON.parse(await readFile(SOURCES_FILE, "utf8"));
  const results = await mapLimit(sources, CONCURRENCY, fetchSource);
  const fresh = results.flatMap((r) => r.items);
  const previous = await loadPrevious();

  const cutoff = Date.now() - MAX_AGE_HOURS * 3600_000;
  const timeOf = (a) => Date.parse(a.publishedAt || a.fetchedAt);
  const merged = dedupeArticles([...fresh, ...previous])
    .filter((a) => timeOf(a) >= cutoff)
    .sort((a, b) => timeOf(b) - timeOf(a))
    .slice(0, MAX_TOTAL);

  const okCount = results.filter((r) => r.status.ok).length;
  const output = {
    generatedAt: new Date().toISOString(),
    demo: false,
    stats: { articles: merged.length, sourcesOk: okCount, sourcesTotal: sources.length },
    sources: sources.map((s, i) => ({
      id: s.id, name: s.name, lang: s.lang, home: s.home, ...results[i].status
    })),
    trends: computeTrends(merged),
    articles: merged
  };

  if (merged.length === 0 && previous.length === 0) {
    console.error("No articles could be fetched from any source.");
  }
  await writeFile(OUTPUT_FILE, JSON.stringify(output) + "\n");
  for (const r of results) {
    console.log(`${r.status.ok ? "✓" : "✗"} ${r.status.id.padEnd(16)} ${String(r.status.items).padStart(3)} items ${r.status.ms}ms ${r.status.error ?? ""}`);
  }
  console.log(`\n${merged.length} articles from ${okCount}/${sources.length} sources → data/news.json`);
  if (okCount === 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
