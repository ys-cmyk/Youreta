// Server-only Slack helpers for the single-workspace "Your ETA" integration.
//
// NEVER import this from client code: it reads the signing secret and bot token
// and performs request-signature verification. Keeping it server-only ensures
// the secrets never reach the browser bundle.
//
// Scope: signature verification (Slack signs the RAW request body), the
// event-link regex used to recognise our own destination URLs, a thin
// chat.unfurl fetch wrapper, and pure Block Kit builders for the slash-command
// card and the link-unfurl card. The builders are pure functions (no I/O) so
// they're trivially testable and safe to call from either route.

import { createHmac, timingSafeEqual } from "crypto";

export type SlackConfig = {
  signingSecret: string;
  botToken: string;
};

// The integration only exists when both secrets are configured (review-login
// philosophy). Returns null otherwise so routes can 404.
export function getSlackConfig(): SlackConfig | null {
  const signingSecret = process.env.SLACK_SIGNING_SECRET ?? "";
  const botToken = process.env.SLACK_BOT_TOKEN ?? "";
  if (!signingSecret || !botToken) return null;
  return { signingSecret, botToken };
}

// Verify a Slack request signature over the RAW body. Slack computes
// `v0=` + HMAC-SHA256(signing_secret, `v0:${timestamp}:${rawBody}`) and sends it
// in x-slack-signature, with the timestamp in x-slack-request-timestamp.
//
// Rejects when either header is missing, when the timestamp isn't all digits or
// is more than 5 minutes from now (replay guard), or when the signatures don't
// match under a constant-time comparison.
export function verifySlackRequest(
  rawBody: string,
  headers: Headers,
  signingSecret: string
): boolean {
  const timestamp = headers.get("x-slack-request-timestamp");
  const signature = headers.get("x-slack-signature");
  if (!timestamp || !signature) return false;

  // Timestamp must be all digits and within ±5 minutes of now.
  if (!/^\d+$/.test(timestamp)) return false;
  const tsSeconds = parseInt(timestamp, 10);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - tsSeconds) > 300) return false;

  const expected =
    "v0=" +
    createHmac("sha256", signingSecret)
      .update(`v0:${timestamp}:${rawBody}`)
      .digest("hex");

  // timingSafeEqual throws on length mismatch, so guard the length first.
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// Matches ONLY our own destination links, anchored and case-insensitive. We
// extract the UUID and never fetch arbitrary URLs — the unfurl reads the DB by
// id, so the regex is the security boundary.
export const EVENT_LINK_RE =
  /^https:\/\/youreta\.app\/events\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

// chat.unfurl target: either the modern unfurl_id + source pair, or the legacy
// channel + message ts pair. Slack accepts either.
export type UnfurlTarget =
  | { unfurl_id: string; source: string }
  | { channel: string; ts: string };

type Block = Record<string, unknown>;

// POST unfurls to chat.unfurl. `unfurls` maps each pasted link URL (byte-exact)
// to its Block Kit payload. Logs a warning (no secrets) when Slack replies
// ok:false so failures are diagnosable without throwing.
export async function chatUnfurl(
  botToken: string,
  target: UnfurlTarget,
  unfurls: Record<string, { blocks: Block[] }>
): Promise<void> {
  const res = await fetch("https://slack.com/api/chat.unfurl", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ ...target, unfurls }),
  });
  try {
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!json.ok) {
      console.warn("[slack] chat.unfurl failed:", json.error ?? "unknown");
    }
  } catch {
    console.warn("[slack] chat.unfurl: could not parse response");
  }
}

// ---- Pure Block Kit builders -------------------------------------------------

// Card posted in-channel by the /eta slash command.
export function buildCommandBlocks(args: {
  title: string;
  address: string | null;
  url: string;
  invokerId: string;
}): Block[] {
  const { title, address, url, invokerId } = args;
  const text = address
    ? `:round_pushpin: *${title}*\n${address}`
    : `:round_pushpin: *${title}*`;
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Open Your ETA", emoji: true },
          url,
          style: "primary",
        },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Everyone who opens the link can share their live ETA. Started by <@${invokerId}>.`,
        },
      ],
    },
  ];
}

// Card rendered when a destination link is unfurled. `count` is the number of
// people who've joined; `nextEtaIso` is the soonest future ETA (or null); `now`
// is the reference time for the relative "next arrival" phrasing.
export function buildUnfurlBlocks(args: {
  title: string;
  address: string | null;
  count: number;
  nextEtaIso: string | null;
  now: Date;
}): Block[] {
  const { title, address, count, nextEtaIso, now } = args;
  const text = address
    ? `:round_pushpin: *${title}*\n${address}`
    : `:round_pushpin: *${title}*`;

  let context: string;
  if (count <= 0) {
    context = "No one has joined yet — open the link to share your ETA";
  } else {
    // Singular handling: one person gets the single-bust emoji.
    const emoji = count === 1 ? ":bust_in_silhouette:" : ":busts_in_silhouette:";
    context = `${emoji} ${count} on the way`;
    if (nextEtaIso) {
      const etaMs = new Date(nextEtaIso).getTime();
      const diffMs = etaMs - now.getTime();
      if (Number.isFinite(diffMs) && diffMs > 0) {
        const minutes = Math.max(1, Math.round(diffMs / 60000));
        context += ` · :clock3: next arrival in ~${minutes}m`;
      }
    }
  }

  return [
    {
      type: "section",
      text: { type: "mrkdwn", text },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: context }],
    },
  ];
}
