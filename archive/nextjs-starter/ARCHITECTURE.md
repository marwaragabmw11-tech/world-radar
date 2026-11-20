# Architecture notes

## Initial shape
Browser → Next.js localized UI → application API → ingestion and intelligence services → PostgreSQL/cache.

## Planned service boundaries
- `source-registry`: allowlisted feeds, licensing notes, publisher metadata.
- `ingestion`: fetch, parse, validate, deduplicate, store; queue work outside request path.
- `enrichment`: language detection, entity/topic extraction, clustering.
- `summarization`: cached locale-specific summaries with citation records and provider provenance.
- `fact-check`: claim decomposition, evidence retrieval, human review state, corrections.
- `notifications`: user-selected alerts with abuse protection.
- `audio`: optional speech generation using only approved free/local providers.

## Cost controls
- Schedule ingestion with jitter and conditional requests (ETag/Last-Modified).
- Cache by article fingerprint + locale + prompt version.
- Reuse summaries across users.
- Batch background jobs; avoid synchronous model calls in page requests.
- Route to approved free/local providers only; do not fall back to paid providers.
- Monitor token usage, latency, queue depth, error rates, and source health.
- Apply fair rate limits and bot protections to public APIs.

## Security
- Keep source fetchers allowlisted to prevent SSRF.
- Validate URLs and redirect destinations.
- Enforce request timeouts and response size caps.
- Sanitize feed HTML before display.
- Add authentication and authorization before private watchlists/notification settings go live.
- Use a shared atomic rate-limit store in production; the included limiter is development-only.
