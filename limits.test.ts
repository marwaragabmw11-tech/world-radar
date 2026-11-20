import {describe, expect, it} from "vitest";
import {LocalRateLimiter} from "../src/lib/limits";

describe("LocalRateLimiter", () => {
  it("blocks after the configured request count", () => {
    const limiter = new LocalRateLimiter({windowMs: 1000, maxRequests: 2});
    expect(limiter.consume("visitor", 100).allowed).toBe(true);
    expect(limiter.consume("visitor", 200).allowed).toBe(true);
    expect(limiter.consume("visitor", 300).allowed).toBe(false);
  });
});
