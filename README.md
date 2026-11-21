# World Radar

**Global news. Free for everyone.** · **أخبار العالم في صفحة واحدة — مجانًا للجميع**

World Radar collects headlines from public RSS feeds in nine languages
(Arabic, English, Hebrew, French, Spanish, German, Portuguese, Japanese, Chinese),
refreshes them every hour and always links each story to its original publisher.

- **World / Local tabs** — world news, or the local press of a chosen country
  (Egypt, Saudi Arabia, UAE, Morocco, Jordan, Lebanon, Israel, US, UK, France,
  Germany, Spain, Brazil, Portugal, Japan, Taiwan, Hong Kong).
- **Israeli press, left to right** — Haaretz, Local Call, +972, Davar, ynet,
  N12, Walla, Kan 11, Times of Israel, Maariv, Jerusalem Post, Israel Hayom,
  Makor Rishon, Channel 14, Arutz 7, Srugim — side by side, with a leaning filter.
  Labels are the commonly cited general editorial orientation, a rough guide only.
- **Israel page** (`#israel`, or `?country=XX` for any country) — that country's
  top Google searches, the words repeating in its headlines, and:
- **What officials and public figures are saying** — the 11 party leaders of the
  26th Knesset, key caretaker ministers, the President and the IDF spokespeople
  (`data/figures.json`). Posts come straight from their official public Telegram
  channels and YouTube RSS; because X/Facebook can't be read for free, headlines
  that quote them ("Name: …") are added and marked with the outlet's name.
- **Top searches now** — Google Trends "trending now" per country.
- **Repeating in headlines** — words several publishers use at the same time.

It costs nothing to run: no server, no database, no API keys, no paid services.

## How it works

```
GitHub Actions (every hour, free)          GitHub Pages (free)
┌─────────────────────────────────┐        ┌──────────────────────────┐
│ scripts/fetch-news.mjs          │        │ index.html + assets/     │
│  • reads data/sources.json      │ ─────▶ │  reads data/news.json    │
│  • fetches & parses RSS/Atom    │ deploy │  • 9 UI languages, RTL   │
│  • dedupes, computes trends     │        │  • search, filters       │
│  • writes data/news.json        │        │  • source health         │
└─────────────────────────────────┘        └──────────────────────────┘
```

Nothing is committed back to the repository on each run, so the repo does not grow.

## One-time setup (≈1 minute)

1. **Settings → Pages → Build and deployment → Source: _GitHub Actions_.**
2. **Actions → "Update news and deploy" → Run workflow.**
3. After ~1 minute the site is live at
   `https://marwaragabmw11-tech.github.io/world-radar/`.

From then on it updates itself every hour.

## الإعداد لأول مرة (بالعربية)

1. من المستودع: **Settings ← Pages ← Source** واختاري **GitHub Actions**.
2. من تبويب **Actions** افتحي **Update news and deploy** واضغطي **Run workflow**.
3. بعد دقيقة تقريبًا يظهر الموقع على الرابط أعلاه، ثم يتحدّث وحده كل ساعة.

## Adding or removing a source

Edit `data/sources.json` (id, name, lang, url, home, country, section
`world`/`local`, optional `leaning`, optional `via`). Only feeds listed there are
ever fetched. Some publishers (e.g. Haaretz, +972, Okaz) block automated readers;
for those the public headlines come from Google News' official RSS search feed
(`via: "google-news"`), and links still lead to the publisher. Search-trend
countries are listed under `searchTrends`. The "Source status" section on the site shows which
feeds worked on the last run.

## Local development

Requires Node.js 20+. No `npm install` needed — there are no dependencies.

```bash
npm test            # parser, dedupe and trend tests
npm run fetch       # fetch feeds into data/news.json
npm run serve       # open http://localhost:8080
```

## Rules the project keeps

- Free for everyone: no subscriptions, paywalls, billing or ads.
- Headlines and short excerpts only, always with the publisher's link; content belongs to publishers.
- Headlines stay in their original language — nothing is machine-translated or machine-written.
- Full RTL for Arabic and Hebrew.
- No paid provider is ever called.

## Limits of the free setup

- Data refreshes hourly (GitHub's scheduler may delay a run by some minutes).
- GitHub pauses scheduled workflows after 60 days with no repository activity;
  any commit (or pressing "Run workflow") turns them back on.
- Some publishers may block automated readers; they simply show as "down".

## License

MIT for the code. Feeds, headlines and logos belong to their publishers.
