// Collect public statements of the figures listed in data/figures.json.
import { parseFeed, stripPublisherSuffix, truncate } from "./rss.mjs";
import { isQuoteHeadline, parseTelegramPreview } from "./telegram.mjs";

const MAX_PER_CHANNEL = 8;
const MAX_QUOTES = 6;

/** @param {(url:string)=>Promise<string>} download */
export async function collectFigure(figure, download) {
  const items = [];
  const status = { id: figure.id, channels: [], quotes: 0 };
  for (const ch of figure.channels || []) {
    try {
      if (ch.type === "telegram") {
        const { posts, verified, title } = parseTelegramPreview(await download(`https://t.me/s/${ch.handle}`), ch.handle);
        for (const p of posts.filter((x) => !x.forwarded).slice(-MAX_PER_CHANNEL)) {
          items.push({
            id: `tg:${p.id}`, figureId: figure.id, kind: "post", platform: "telegram",
            text: truncate(p.text, 500), url: p.url,
            publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null
          });
        }
        status.channels.push({ type: ch.type, handle: ch.handle, ok: posts.length > 0, posts: posts.length, verified, title });
      } else if (ch.type === "youtube") {
        const videos = parseFeed(await download(`https://www.youtube.com/feeds/videos.xml?channel_id=${ch.channelId}`)).slice(0, MAX_PER_CHANNEL);
        for (const v of videos) {
          items.push({
            id: `yt:${v.link}`, figureId: figure.id, kind: "video", platform: "youtube",
            text: truncate(v.title, 300), url: v.link,
            publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null
          });
        }
        status.channels.push({ type: ch.type, label: ch.label, ok: videos.length > 0, posts: videos.length });
      }
    } catch (err) {
      status.channels.push({ type: ch.type, handle: ch.handle || ch.label, ok: false, error: String(err?.message || err).slice(0, 120) });
    }
  }
  if (figure.news) {
    try {
      const quotes = parseFeed(await download(figure.news.url))
        .map((it) => ({ ...it, title: stripPublisherSuffix(it.title, [it.sourceName]) }))
        .filter((it) => isQuoteHeadline(it.title, figure.news.names))
        .slice(0, MAX_QUOTES);
      for (const q of quotes) {
        items.push({
          id: `gn:${q.link}`, figureId: figure.id, kind: "quote", platform: "news",
          text: truncate(q.title, 300), url: q.link, publisher: q.sourceName || "",
          lang: figure.news.lang,
          publishedAt: q.publishedAt ? q.publishedAt.toISOString() : null
        });
      }
      status.quotes = quotes.length;
    } catch (err) {
      status.quotesError = String(err?.message || err).slice(0, 120);
    }
  }
  return { status, items };
}
