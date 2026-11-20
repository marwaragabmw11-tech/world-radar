# World Radar — Product Requirements (Bootstrap)

## Vision
Global Intelligence. Powered by AI. Free for Everyone.

Help people understand what is happening around the world through timely, contextual, multilingual news and transparent AI-assisted analysis.

## Non-negotiable product rules
1. The product is free for every user.
2. No subscriptions, paid tiers, paywalls, payment processing, premium entitlements, or upselling.
3. The same feature set is available across supported languages and platforms.
4. Arabic and Hebrew require true RTL, not just translated strings.
5. Preserve source identity, canonical URL, original language, publication time, and update time.
6. AI-generated outputs must be clearly labeled, grounded in cited source records, and communicate uncertainty.
7. Never silently invoke a paid AI/news provider. Use approved free providers, cache, queue, or graceful fallback.
8. Protect services from abuse through fair rate limits and anti-automation controls, not monetization tiers.

## Launch languages
| Code | Language | Direction |
|---|---|---|
| ar | العربية | RTL |
| en | English | LTR |
| he | עברית | RTL |
| fr | Français | LTR |
| es | Español | LTR |
| de | Deutsch | LTR |
| pt | Português | LTR |
| ja | 日本語 | LTR |
| zh | 中文 | LTR |

## Core information architecture
- Home / World Pulse
- Breaking News
- Trending
- Topics and regions
- What's Emerging
- The Big Picture / Deep Analysis
- Fact Check
- AI Assistant
- Watchlists
- Audio Briefings
- Settings: language, region, accessibility, notifications

## Content card requirements
- Headline in the selected UI language when a verified translation exists; otherwise retain original headline and identify its language.
- Publisher/source and link.
- Publication time with timezone-aware formatting.
- Region/topic labels.
- Distinguish reporting, opinion, analysis, and AI-generated explanation.
- Never imply that an AI-generated summary is the publisher's original text.

## RTL acceptance criteria
- Set document `dir=rtl` and `lang` per locale.
- Use logical CSS properties (`margin-inline`, `padding-inline`, `inset-inline`) rather than left/right assumptions.
- Test mixed Arabic/Hebrew + Latin names, URLs, numerals, and punctuation.
- Mirror directional icons only where semantics require it.
- Charts and maps must not reverse geographic meaning.
- Search input, navigation, menus, pagination, and reading order must work in RTL.

## Trust and safety
- Display source links and update timestamps.
- Track source reliability metadata internally; do not present opaque scores as truth.
- Fact-check labels require explicit methodology and evidence; AI alone cannot certify a claim.
- Provide correction/report pathways.
- Do not generate fabricated quotes, sources, or citations.
- Separate factual reporting from analysis and commentary.

## Non-functional requirements
- Responsive and accessible interface (keyboard, screen reader, contrast).
- Fast initial load, cached public data, pagination, and query limits.
- Secure secret handling and least-privilege credentials.
- Privacy by default; collect only data required for chosen features.
- Observability without logging sensitive user content unnecessarily.
- Graceful degradation when feeds, AI providers, or databases are unavailable.

## Release acceptance gates
- All nine locales render without missing-key errors.
- Arabic and Hebrew pass RTL visual and interaction checks.
- No billing/payment/subscription code or UI.
- Each displayed story has a source or is explicitly marked demonstration content.
- AI features do not invent source references.
- Rate limiting and provider fallback are tested.
- Accessibility and security reviews completed before public launch.
