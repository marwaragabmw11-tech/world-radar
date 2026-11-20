# Roadmap

## Phase 1 — Working free MVP ✅
- [x] Static site with nine UI languages and full RTL (Arabic, Hebrew)
- [x] Allowlisted RSS/Atom ingestion with timeouts, size caps, no dependencies
- [x] Deduplication by URL and headline
- [x] "What's emerging": terms used by several publishers in the last 24 h
- [x] Search, language and source filters, source health
- [x] Hourly GitHub Actions run + GitHub Pages deploy (no repo growth)
- [x] Unit tests run on every deploy

## Phase 2 — Better coverage (still free)
- [ ] Review each publisher's terms and replace feeds that block bots
- [ ] More sources per language and regional/topic tags
- [ ] Group the same event across publishers and languages (clustering)
- [ ] Installable PWA and offline reading of the last update

## Phase 3 — AI layer (only with an approved free provider)
- [ ] Short summaries citing the stored source links, clearly labelled as AI
- [ ] Cache summaries per story so each is generated once
- [ ] Hard stop when the free quota is used up — never fall back to a paid provider

## Phase 4 — Personal features
- [ ] Saved topics / watchlists stored on the device
- [ ] Audio briefings using the browser's built-in speech
