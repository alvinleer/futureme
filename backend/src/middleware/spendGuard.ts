/**
 * AI spend ceilings.
 *
 * Every AI endpoint proxies a metered upstream API. Without a ceiling, a
 * client stuck in a retry loop — or one stolen token — bills us until someone
 * notices in the morning. `spendGuard` refuses the request when the rolling
 * spend already recorded in `ai_usage` is over budget; `recordAiUsage` writes
 * the ledger row after the upstream call returns.
 *
 * The ledger is append-only and cheap to query: the guard reads three SUMs off
 * the `idx_ai_usage_user_time` / `idx_ai_usage_time` indexes.
 */

import type { Context, Next } from "hono";
import { getDb, newId } from "../db";
import { limits } from "../env";

// ── Pricing ───────────────────────────────────────────────────────────────────

interface TokenPrice {
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
}

/**
 * USD per 1M tokens, matched by model-ID prefix (longest prefix wins).
 *
 * The OpenAI / Gemini entries are deliberately conservative round-ups: we
 * would rather over-count and stop early than under-count and overspend.
 * They are only used for budgeting, never for billing anyone.
 */
const TOKEN_PRICES: Record<string, TokenPrice> = {
  // OpenAI — conservative estimates
  "gpt-4o-mini": { input: 0.6, output: 2.4 },
  "gpt-4o": { input: 5, output: 20 },
  "gpt-4": { input: 30, output: 60 },
  "gpt-5": { input: 5, output: 20 },
  "o1": { input: 15, output: 60 },

  // Google — conservative estimates
  "gemini": { input: 2, output: 8 },
};

/**
 * Charged when a model is not in the table. Set high on purpose: an unpriced
 * model must never bill as $0 and slip past the ceiling unnoticed.
 */
const UNKNOWN_MODEL_PRICE: TokenPrice = { input: 15, output: 60 };

/**
 * Flat per-call costs for endpoints that are not token-metered, matched by the
 * `endpoint` string recorded in the ledger. Conservative round-ups again.
 */
const FLAT_COSTS: Record<string, number> = {
  "image/generate": 0.19, // gpt-image-1, 1024x1024 high quality
  "gemini/generate-image": 0.04,
  "visualization/faceswap": 0.05, // fal.ai face-swap
  "audio/transcribe": 0.02, // ~3 min of gpt-4o-transcribe
  tts: 0.03, // ElevenLabs, ~1500 characters
};

function priceFor(model: string): TokenPrice {
  const id = model.toLowerCase();
  let best: { prefix: string; price: TokenPrice } | null = null;
  for (const [prefix, price] of Object.entries(TOKEN_PRICES)) {
    if (id.startsWith(prefix) && (!best || prefix.length > best.prefix.length)) {
      best = { prefix, price };
    }
  }
  return best?.price ?? UNKNOWN_MODEL_PRICE;
}

/** USD cost of a token-metered call. */
export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const price = priceFor(model);
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

/** USD cost of a non-token-metered call, by ledger endpoint name. */
export function flatCost(endpoint: string): number {
  return FLAT_COSTS[endpoint] ?? 0.05;
}

// ── Ledger ────────────────────────────────────────────────────────────────────

export interface AiUsage {
  userId: string;
  endpoint: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd: number;
}

/**
 * Append a row to the spend ledger. Never throws — a bookkeeping failure must
 * not turn a successful AI response into a 500 for the user.
 */
export function recordAiUsage(usage: AiUsage): void {
  try {
    getDb().run(
      `INSERT INTO ai_usage (id, user_id, endpoint, model, input_tokens, output_tokens, cost_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        usage.userId,
        usage.endpoint,
        usage.model,
        usage.inputTokens ?? 0,
        usage.outputTokens ?? 0,
        usage.costUsd,
      ]
    );
  } catch (err) {
    console.error("[spendGuard] Failed to record AI usage:", err);
  }
}

// ── Guard ─────────────────────────────────────────────────────────────────────

interface SumRow {
  total: number | null;
}

function spendSince(sql: string, params: unknown[]): number {
  const row = getDb().query<SumRow, never[]>(sql).get(...(params as never[])) as SumRow | null;
  return row?.total ?? 0;
}

export interface SpendSnapshot {
  userDaily: number;
  globalDaily: number;
  globalMonthly: number;
}

/** Current rolling spend across the three windows we cap. */
export function currentSpend(userId: string): SpendSnapshot {
  return {
    userDaily: spendSince(
      `SELECT SUM(cost_usd) AS total FROM ai_usage
        WHERE user_id = ? AND created_at > datetime('now', '-1 day')`,
      [userId]
    ),
    globalDaily: spendSince(
      `SELECT SUM(cost_usd) AS total FROM ai_usage
        WHERE created_at > datetime('now', '-1 day')`,
      []
    ),
    globalMonthly: spendSince(
      `SELECT SUM(cost_usd) AS total FROM ai_usage
        WHERE created_at > datetime('now', '-30 day')`,
      []
    ),
  };
}

/**
 * Rejects the request with 429 when any rolling ceiling is already exceeded.
 * Must run after `requireAuth` — it needs the authenticated user id.
 *
 * The check is intentionally pre-flight and approximate: it stops the *next*
 * call once the budget is gone rather than pro-rating the one in flight, so a
 * single request can overshoot by at most its own cost.
 */
export function spendGuard() {
  return async (c: Context, next: Next) => {
    const userId = c.get("userId") as string | undefined;
    if (!userId) return c.json({ error: "Unauthorized" }, 401);

    const spend = currentSpend(userId);

    if (spend.globalMonthly >= limits.aiMonthlyCostGlobal) {
      console.error(
        `[spendGuard] MONTHLY GLOBAL CEILING HIT: $${spend.globalMonthly.toFixed(2)} >= $${limits.aiMonthlyCostGlobal}`
      );
      return c.json(
        { error: "AI features are temporarily unavailable. Please try again later.", reason: "monthly_budget" },
        429
      );
    }

    if (spend.globalDaily >= limits.aiDailyCostGlobal) {
      console.error(
        `[spendGuard] DAILY GLOBAL CEILING HIT: $${spend.globalDaily.toFixed(2)} >= $${limits.aiDailyCostGlobal}`
      );
      return c.json(
        { error: "AI features are temporarily unavailable. Please try again later.", reason: "daily_budget" },
        429
      );
    }

    if (spend.userDaily >= limits.aiDailyCostPerUser) {
      return c.json(
        {
          error: "You've reached today's AI usage limit. It resets in a few hours.",
          reason: "user_daily_budget",
        },
        429
      );
    }

    await next();
  };
}
