// `lib/ops/alert.ts` — CB-6.8 operator alerting via Telegram.
//
// Optional + ENV-GATED: if TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are unset,
// sendAlert is a NO-OP (graceful degradation, like other optional integrations
// — e.g. APP_ORIGIN). It NEVER throws into the caller: an alert failure
// (network / timeout / HTTP) must not break a bot tick or an order placement
// (mirrors the trace emitters' "logging must never take down a tick").
//
// EGRESS MINIMALISM (security, CB-6.8 AC 8): only non-sensitive order metadata
// leaves the system — asset · side · amount · sanitized reason. The bot token
// is never logged/echoed; reasons are run through sanitizeErrorDetail (the same
// redaction the log drain uses) so no secret-shaped material (PEM / JWT /
// Bearer) can egress to Telegram.

import { env } from "@/lib/env";
import { sanitizeErrorDetail } from "@/lib/ticks/trace";

const TELEGRAM_TIMEOUT_MS = 4000;

/**
 * Send an operator alert via the Telegram Bot API. No-op when unconfigured;
 * never throws (all failures swallowed). `await` it at the (rare) failure site
 * so the HTTP completes before a serverless function freezes.
 */
export async function sendAlert(text: string): Promise<void> {
  const token = env().TELEGRAM_BOT_TOKEN;
  const chatId = env().TELEGRAM_CHAT_ID;
  if (!token || !chatId) return; // alerting disabled — no-op
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
    });
  } catch {
    // An alert failure must never affect the caller (tick / order path).
  }
}

/** Pure: format a failed-order alert. Reason re-sanitized as defense-in-depth. */
export function formatOrderFailureAlert(args: {
  source: "bot" | "run-now" | "manual";
  asset: string;
  side: "buy" | "sell";
  reason: string | null;
  amountUsd?: number;
}): string {
  const amt = args.amountUsd != null ? ` $${args.amountUsd}` : "";
  const reason = sanitizeErrorDetail(args.reason ?? "unknown reason");
  return `⚠️ ${args.source} order FAILED: ${args.side.toUpperCase()} ${args.asset}${amt} — ${reason}`;
}

/** Pure: format a bot-tick error alert. Reason re-sanitized as defense-in-depth. */
export function formatTickErrorAlert(reason: string): string {
  return `🛑 Bot tick ERROR: ${sanitizeErrorDetail(reason)}`;
}
