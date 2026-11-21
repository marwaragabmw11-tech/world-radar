import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesScripts, parseFeed, parseTrendsFeed, stripPublisherSuffix, toPlainText, trafficValue, truncate } from "../scripts/lib/rss.mjs";
import { articleFingerprint, canonicalizeUrl, dedupeArticles, normalizeHeadline } from "../scripts/lib/dedupe.mjs";
import { computeTrends, tokenize } from "../scripts/lib/trends.mjs";
import { decodeXml } from "../scripts/fetch-news.mjs";
import { isQuoteHeadline, parseTelegramPreview } from "../scripts/lib/telegram.mjs";
import { collectFigure } from "../scripts/lib/figures.mjs";

const RSS2 = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>Feed</title><link>https://example.com</link>
<atom:link href="https://example.com/rss" rel="self"/>
<item>
  <title><![CDATA[Leaders meet &amp; talk]]></title>
  <link>https://example.com/a?utm_source=rss#top</link>
  <description>&lt;p&gt;First &lt;b&gt;paragraph&lt;/b&gt;&lt;/p&gt;</description>
  <pubDate>Fri, 20 Nov 2026 10:00:00 GMT</pubDate>
</item>
<item>
  <title>قمة عربية في القاهرة</title>
  <guid isPermaLink="true">https://example.com/ar/1</guid>
  <dc:date>2026-11-20T09:00:00Z</dc:date>
</item>
<item><title>No link item</title></item>
</channel></rss>`;

const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom">
<entry><title type="html">Atom &#8220;story&#8221;</title>
<link rel="alternate" href="https://example.org/x"/>
<summary>Short summary</summary><updated>2026-11-20T08:00:00Z</updated></entry>
</feed>`;

const RDF = `<rdf:RDF><item rdf:about="https://dw.example/y"><title>DW story</title>
<link>https://dw.example/y</link><dc:date>2026-11-20T07:00:00Z</dc:date></item></rdf:RDF>`;

test("parses RSS 2.0 items, CDATA, entities and guid links", () => {
  const items = parseFeed(RSS2);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Leaders meet & talk");
  assert.equal(items[0].excerpt, "First paragraph");
  assert.equal(items[0].publishedAt.toISOString(), "2026-11-20T10:00:00.000Z");
  assert.equal(items[1].title, "قمة عربية في القاهرة");
  assert.equal(items[1].link, "https://example.com/ar/1");
  assert.equal(items[1].publishedAt.toISOString(), "2026-11-20T09:00:00.000Z");
});

test("parses Atom and RDF feeds", () => {
  const [atom] = parseFeed(ATOM);
  assert.equal(atom.title, "Atom “story”");
  assert.equal(atom.link, "https://example.org/x");
  const [rdf] = parseFeed(RDF);
  assert.equal(rdf.link, "https://dw.example/y");
});

test("strips scripts and tags from feed HTML", () => {
  assert.equal(toPlainText("<p>Hi<script>alert(1)</script> there</p>"), "Hi there");
});

test("truncates on a word boundary", () => {
  assert.equal(truncate("alpha beta gamma delta", 15), "alpha beta…");
});

test("normalizes headlines and URLs", () => {
  assert.equal(normalizeHeadline("World—News!   Today"), "world news today");
  assert.equal(canonicalizeUrl("https://Example.com/story/?utm_medium=x#top"), "https://example.com/story");
  assert.equal(
    articleFingerprint({ canonicalUrl: "https://example.com/story#top", title: "A headline" }),
    articleFingerprint({ canonicalUrl: "https://example.com/story", title: "A headline" })
  );
});

test("dedupes by URL and by same-language headline", () => {
  const out = dedupeArticles([
    { url: "https://a.com/1", title: "Same title", lang: "en" },
    { url: "https://a.com/1?utm_source=x", title: "Other", lang: "en" },
    { url: "https://b.com/2", title: "Same  title!", lang: "en" },
    { url: "https://c.com/3", title: "Same title", lang: "fr" }
  ]);
  assert.equal(out.length, 2);
});

test("tokenizes Arabic, Japanese and English titles", () => {
  assert.deepEqual(tokenize("القمة العربية في القاهرة", "ar"), ["قمة", "عربية", "قاهرة"]);
  assert.ok(tokenize("東京で大きな地震", "ja").length > 0);
  assert.deepEqual(tokenize("The summit in Cairo", "en"), ["summit", "cairo"]);
});

test("trends need several publishers", () => {
  const now = Date.parse("2026-11-20T12:00:00Z");
  const at = "2026-11-20T11:00:00Z";
  const trends = computeTrends([
    { title: "Cairo summit opens", lang: "en", sourceId: "a", publishedAt: at },
    { title: "Leaders arrive in Cairo", lang: "en", sourceId: "b", publishedAt: at },
    { title: "Weather report", lang: "en", sourceId: "a", publishedAt: at }
  ], { now });
  assert.deepEqual(trends.en.map((t) => t.term), ["cairo"]);
});

const GOOGLE_NEWS = `<rss><channel><item><title>נתניהו נפגש עם איזנקוט - הארץ</title>
<link>https://news.google.com/rss/articles/abc</link><pubDate>Sat, 21 Nov 2026 07:46:00 GMT</pubDate>
<source url="https://www.haaretz.co.il">הארץ</source></item></channel></rss>`;

test("strips the publisher suffix from Google News headlines", () => {
  const [item] = parseFeed(GOOGLE_NEWS);
  assert.equal(item.sourceName, "הארץ");
  assert.equal(stripPublisherSuffix(item.title, [item.sourceName]), "נתניהו נפגש עם איזנקוט");
  assert.equal(stripPublisherSuffix("Short - X", ["X"]), "Short - X");
});

const TRENDS = `<rss xmlns:ht="https://trends.google.com/trending/rss"><channel>
<item><title>مطر</title><ht:approx_traffic>100,000+</ht:approx_traffic><pubDate>Sat, 21 Nov 2026 05:30:00 -0800</pubDate>
<ht:news_item><ht:news_item_title>ignored</ht:news_item_title></ht:news_item></item>
<item><title>แมนซิตี พบ ฟูลัม</title><ht:approx_traffic>2K+</ht:approx_traffic></item>
</channel></rss>`;

test("parses Google Trends and filters foreign scripts", () => {
  const items = parseTrendsFeed(TRENDS);
  assert.equal(items.length, 2);
  assert.equal(items[0].term, "مطر");
  assert.equal(items[0].value, 100000);
  assert.equal(trafficValue("2K+"), 2000);
  assert.deepEqual(items.filter((t) => matchesScripts(t.term, ["Arabic", "Latin"])).map((t) => t.term), ["مطر"]);
  assert.ok(matchesScripts("コンカフェ", ["Han", "Hiragana", "Katakana", "Latin"]));
});

test("decodes UTF-8 even when the feed wrongly declares utf-16", () => {
  const xml = '<?xml version="1.0" encoding="utf-16"?><rss><item><title>مصر</title></item></rss>';
  assert.ok(decodeXml(Buffer.from(xml, "utf8")).includes("مصر"));
});

const TG = `<meta property="og:title" content="בנימין נתניהו"><i class="verified-icon"></i>
<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message" data-post="bnetanyahu/123"><div class="tgme_widget_message_text js-message_text" dir="auto">שלום <b>עולם</b><br/>שורה &amp; שנייה <i class="emoji" style="x"><b>🇮🇱</b></i></div><a class="tgme_widget_message_date" href="https://t.me/bnetanyahu/123"><time datetime="2026-11-20T11:14:15+00:00" class="time">11:14</time></a></div></div>
<div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="bnetanyahu/124"><div class="tgme_widget_message_photo_wrap"></div><time datetime="2026-11-20T12:00:00+00:00"></time></div></div>
<div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="someoneelse/9"><div class="tgme_widget_message_text">not ours</div></div></div>`;

test("reads Telegram public previews (text posts of that channel only)", () => {
  const r = parseTelegramPreview(TG, "bnetanyahu");
  assert.equal(r.verified, true);
  assert.equal(r.posts.length, 1);
  assert.equal(r.posts[0].text, "שלום עולם\nשורה & שנייה 🇮🇱");
  assert.equal(r.posts[0].url, "https://t.me/bnetanyahu/123");
});

test("recognises quote headlines only when the person is the speaker", () => {
  const N = ["נתניהו", "ראש הממשלה"];
  assert.ok(isQuoteHeadline('נתניהו: "יש כוונה להקים ממשלה"', N));
  assert.ok(isQuoteHeadline("איזנקוט: ״x״; נתניהו: ״y״", N));
  assert.ok(isQuoteHeadline("ראש הממשלה נתניהו: לא נוותר", N));
  assert.ok(!isQuoteHeadline("מעקב סודי על יאיר נתניהו: חברת אבטחה", N));
  assert.ok(!isQuoteHeadline("היום שאחרי נתניהו: התרחיש", N));
  assert.ok(isQuoteHeadline("أدرعي: بيان", ["أدرعي"]));
});

test("collects a figure's posts and quote headlines", async () => {
  const pages = {
    "https://t.me/s/bnetanyahu": TG,
    "https://news.example/q": `<rss><item><title>נתניהו: לא נוותר - ynet</title><link>https://n.example/1</link><source>ynet</source><pubDate>Fri, 20 Nov 2026 10:00:00 GMT</pubDate></item><item><title>היום שאחרי נתניהו: ניתוח</title><link>https://n.example/2</link></item></rss>`
  };
  const { items, status } = await collectFigure(
    { id: "n", channels: [{ type: "telegram", handle: "bnetanyahu" }], news: { url: "https://news.example/q", names: ["נתניהו"], lang: "he" } },
    async (url) => pages[url]
  );
  assert.deepEqual(items.map((i) => i.kind), ["post", "quote"]);
  assert.equal(items[1].text, "נתניהו: לא נוותר");
  assert.equal(items[1].publisher, "ynet");
  assert.equal(status.quotes, 1);
});
