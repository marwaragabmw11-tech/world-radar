import { readFileSync } from "node:fs";
import { collectFigure } from "../scripts/lib/figures.mjs";
const { figures } = JSON.parse(readFileSync(new URL("../data/figures.json", import.meta.url), "utf8"));
const UA = "WorldRadarBot/1.0 (+https://github.com/marwaragabmw11-tech/world-radar)";
const download = async (url) => { const r = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); };
for (const f of figures) {
  const { status, items } = await collectFigure(f, download);
  console.log(`FIG ${f.id} | quotes=${status.quotes}${status.quotesError ? " ERR " + status.quotesError : ""} | channels=${JSON.stringify(status.channels)}`);
  for (const it of items.slice(-3)) console.log(`  ITEM ${f.id} ${it.kind} ${it.publishedAt} :: ${it.text.replace(/\s+/g, " ").slice(0, 140)}`);
}
for (const h of ["gadi_eisenkot", "yairgolan", "aryederi"]) {
  const html = await download(`https://t.me/s/${h}`);
  const { parseTelegramPreview } = await import("../scripts/lib/telegram.mjs");
  const r = parseTelegramPreview(html, h);
  console.log(`CHECK ${h} title=${r.title} verified=${r.verified} desc=${(html.match(/<meta property="og:description" content="([^"]*)"/)?.[1] || "").slice(0, 150)}`);
  for (const p of r.posts.slice(-3)) console.log(`  POST ${h} ${p.publishedAt?.toISOString()} fwd=${p.forwarded} :: ${p.text.replace(/\s+/g, " ").slice(0, 160)}`);
}
