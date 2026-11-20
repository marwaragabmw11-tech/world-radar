export type RateLimitPolicy = {
  windowMs: number;
  maxRequests: number;
};

/**
 * In-memory development-only guard. Production deployments must use a shared
 * atomic store (for example Redis) behind an approved deployment decision.
 */
export class LocalRateLimiter {
  private readonly buckets = new Map<string, {count: number; resetAt: number}>();

  constructor(private readonly policy: RateLimitPolicy) {}

  consume(key: string, now = Date.now()): {allowed: boolean; remaining: number; resetAt: number} {
    const current = this.buckets.get(key);
    if (!current || now >= current.resetAt) {
      const next = {count: 1, resetAt: now + this.policy.windowMs};
      this.buckets.set(key, next);
      return {allowed: true, remaining: Math.max(0, this.policy.maxRequests - 1), resetAt: next.resetAt};
    }
    if (current.count >= this.policy.maxRequests) {
      return {allowed: false, remaining: 0, resetAt: current.resetAt};
    }
    current.count += 1;
    return {allowed: true, remaining: this.policy.maxRequests - current.count, resetAt: current.resetAt};
  }
}
