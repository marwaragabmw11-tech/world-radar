export type IngestedArticle = {
  sourceId: string;
  externalId?: string;
  canonicalUrl: string;
  title: string;
  excerpt?: string;
  language: string;
  publishedAt?: Date;
  fetchedAt: Date;
};

export interface NewsSourceAdapter {
  readonly id: string;
  fetchLatest(signal?: AbortSignal): Promise<IngestedArticle[]>;
}
