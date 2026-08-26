/**
 * In-memory rate limiter middleware.
 *
 * Usage:
 *   router.post("/login", rateLimit(10, 60_000), handler);
 *
 * Entries are cleaned up every 5 minutes to prevent unbounded memory growth.
 * For multi-instance deployments, swap the Map for a shared Redis store.
 */

import type { Context, Next } from "hono";

interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();

// Purge expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of store) {
    if (now > val.resetAt) store.delete(key);
  }
}, 5 * 60 * 1000).unref();

/**
 * Returns a Hono middleware that limits each IP to `maxRequests`
 * within a rolling `windowMs` millisecond window.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rateLimit(maxRequests: number, windowMs: number) {
  return async (c: Context<any>, next: Next) => {
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      "unknown";
    const key = `${ip}:${c.req.path}`;
    const now = Date.now();

    const entry = store.get(key);
    if (entry && now < entry.resetAt) {
      if (entry.count >= maxRequests) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        c.header("Retry-After", String(retryAfter));
        return c.json({ error: "Too many requests. Please try again later." }, 429);
      }
      entry.count++;
    } else {
      store.set(key, { count: 1, resetAt: now + windowMs });
    }

    await next();
  };
}
