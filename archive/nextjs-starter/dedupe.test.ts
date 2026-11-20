import {describe, expect, it} from "vitest";
import {articleFingerprint, normalizeHeadline} from "../src/lib/news/dedupe";

describe("article deduplication", () => {
  it("normalizes punctuation and whitespace", () => {
    expect(normalizeHeadline("World—News!   Today")).toBe("world news today");
  });

  it("creates stable fingerprints for the same canonical article", () => {
    const a = articleFingerprint({canonicalUrl: "https://example.com/story#top", title: "A headline"});
    const b = articleFingerprint({canonicalUrl: "https://example.com/story", title: "A headline"});
    expect(a).toBe(b);
  });
});
