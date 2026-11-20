# World Radar

**Global Intelligence. Powered by AI. Free for Everyone.**

World Radar is a multilingual global news intelligence platform starter. This repository is the first implementation foundation, not a production deployment.

## Product commitments
- Free for everyone: no paid tiers, subscriptions, paywalls, billing, or payment flows.
- Launch locales: Arabic (`ar`), English (`en`), Hebrew (`he`), French (`fr`), Spanish (`es`), German (`de`), Portuguese (`pt`), Japanese (`ja`), Chinese (`zh`).
- Full RTL layout support for Arabic and Hebrew.
- Preserve original article language and source attribution.
- Cost-aware infrastructure: RSS/GDELT ingestion adapters, deduplication, caching, provider fallback, rate limits, and no automatic paid-provider fallback.
- Web foundation first; mobile clients can consume the same API as a later phase.

## Stack
- Next.js App Router + TypeScript
- Tailwind CSS
- next-intl locale routing
- PostgreSQL + Prisma schema
- RSS ingestion foundation (server-side)
- Vitest for utility tests

## Quick start
Requirements: Node.js 20.9+ and npm.

```bash
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:3000.

The app runs in demo mode without external API keys and clearly labels seeded/demo content. Configure `DATABASE_URL` before applying Prisma migrations.

## Scripts
```bash
npm run dev
npm run build
npm run start
npm run lint
npm run test
npm run db:generate
npm run db:migrate
```

## GitHub: create your repository
1. Create a new empty repository on GitHub named `world-radar`.
2. Do not initialize it with a README or license (this package already includes them).
3. Extract this ZIP, open a terminal in the extracted `world-radar` folder, then run:

```bash
git init
git add .
git commit -m "chore: bootstrap World Radar"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/world-radar.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

## Important production notes
- No external paid service is enabled by default.
- Do not commit `.env` files, credentials, API tokens, or private keys.
- The sample home feed uses clearly marked demonstration stories until real ingestion and moderation are configured.
- RSS publishers retain their own content rights. Store metadata/excerpts and link to publishers; do not republish full copyrighted articles without permission.
- AI summaries and fact-check outputs must show source links, timestamps, uncertainty, and model/provider provenance. They must never be presented as independently verified facts merely because AI produced them.
- Free infrastructure limits must be handled with cache/queue/fallback or a graceful unavailable state; never silently switch to paid providers.
- This repository does not yet contain a production-grade AI assistant, verified global feed, native Android/iOS clients, deployment secrets, or production monitoring.

## Planned milestones
1. **Foundation (this repository):** localized web shell, design system, product requirements, schema, source adapter interfaces, tests, CI.
2. **News ingestion:** source registry, RSS/GDELT connectors, retry/backoff, deduplication, language detection, editorial source quality.
3. **Intelligence layer:** summaries, topic clustering, fact-check workflow, citation grounding, cost-aware model routing, human escalation.
4. **User features:** accounts (optional), watchlists, alerts, audio briefings, preferences, accessibility.
5. **Mobile:** Android/iOS clients sharing the API and localization resources.
6. **Hardening:** security review, load tests, privacy review, observability, disaster recovery, launch checklist.

## License
MIT for this starter code unless otherwise noted. Data, third-party feeds, logos, and publisher content retain their own licenses and terms.
