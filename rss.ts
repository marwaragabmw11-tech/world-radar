import type {IngestedArticle, NewsSourceAdapter} from "./types";

/**
 * RSS parsing is intentionally an adapter boundary in the bootstrap.
 * Add a maintained parser and per-source allowlist before enabling ingestion.
 * Never accept arbitrary user-supplied feed URLs from public API requests.
 */
export class RssSourceAdapter implements NewsSourceAdapter {
  readonly id: string;

  constructor(
    id: string,
    private readonly feedUrl: URL
  ) {
    if (!["https:", "http:"].includes(feedUrl.protocol)) {
      throw new Error("RSS feed URL must use HTTP(S).");
    }
    this.id = id;
  }

  async fetchLatest(_signal?: AbortSignal): Promise<IngestedArticle[]> {
    // Safe default: no network collection until a vetted parser and source registry are configured.
    void this.feedUrl;
    return [];
  }
}
