/**
 * Authentication middleware — verifies Bearer JWT tokens on protected routes.
 * On success, sets "userId" in the Hono context for downstream handlers.
 */

import type { Context, Next } from "hono";
import { verify } from "hono/jwt";

const getSecret = () => process.env.JWT_SECRET!;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function requireAuth(c: Context<any>, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const token = authHeader.slice(7);
  try {
    const payload = (await verify(token, getSecret())) as { userId: string };
    if (!payload.userId) return c.json({ error: "Unauthorized" }, 401);
    c.set("userId", payload.userId);
    await next();
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
}
