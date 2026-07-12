import { NextResponse, after } from "next/server";
import {
  getSlackConfig,
  verifySlackRequest,
  chatUnfurl,
  buildUnfurlBlocks,
  EVENT_LINK_RE,
  type UnfurlTarget,
} from "@/lib/slack";
import { createAdminClient } from "@/lib/slack-host";

// Slack Events API endpoint. Handles the one-time url_verification handshake and
// link_shared events for youreta.app/events/<uuid> links (link unfurling).
//
// Env-gated → 404 without the Slack secrets. Slack signs the RAW body, so we
// read request.text() first and verify before parsing. All unfurl work is
// ack-then-fire via after(): we return 200 immediately (Slack retries anything
// slow) and do the DB reads + chat.unfurl in the background. Errors there are
// swallowed after logging — we never throw back to Slack.

type SlackLink = { url?: string; domain?: string };

type SlackEvent = {
  type?: string;
  channel?: string;
  message_ts?: string;
  unfurl_id?: string;
  source?: string;
  links?: SlackLink[];
};

type SlackEnvelope = {
  type?: string;
  challenge?: string;
  event?: SlackEvent;
};

// Background unfurl: for each recognised destination link, read a fresh snapshot
// (event row, joined count, soonest future ETA) and post it via chat.unfurl.
async function doUnfurl(event: SlackEvent, links: SlackLink[], botToken: string) {
  try {
    const admin = createAdminClient();
    const now = new Date();
    const nowIso = now.toISOString();

    // Map each pasted link URL (byte-exact) to its unfurl payload.
    const unfurls: Record<string, { blocks: Record<string, unknown>[] }> = {};

    // Dedupe by UUID but keep the original URL string for the unfurls key.
    const seen = new Set<string>();
    for (const link of links) {
      const url = link.url ?? "";
      const m = EVENT_LINK_RE.exec(url);
      if (!m) continue;
      const id = m[1].toLowerCase();
      if (seen.has(id)) continue;
      seen.add(id);

      const { data: row } = await admin
        .from("ec_events")
        .select("title, venue_name, venue_address")
        .eq("id", id)
        .maybeSingle();
      if (!row) continue; // Missing / deleted destination → skip.

      const { count } = await admin
        .from("ec_rsvps")
        .select("*", { count: "exact", head: true })
        .eq("event_id", id);

      const { data: soonest } = await admin
        .from("ec_rsvps")
        .select("eta")
        .eq("event_id", id)
        .not("eta", "is", null)
        .gte("eta", nowIso)
        .order("eta", { ascending: true })
        .limit(1)
        .maybeSingle();

      const address =
        (row.venue_address as string | null)?.trim() ||
        (row.venue_name as string | null)?.trim() ||
        null;

      unfurls[url] = {
        blocks: buildUnfurlBlocks({
          title: (row.title as string) ?? "Destination",
          address,
          count: count ?? 0,
          nextEtaIso: (soonest?.eta as string | null) ?? null,
          now,
        }),
      };
    }

    if (Object.keys(unfurls).length === 0) return;

    // Prefer unfurl_id + source when Slack supplies both; else channel + ts.
    const target: UnfurlTarget =
      event.unfurl_id && event.source
        ? { unfurl_id: event.unfurl_id, source: event.source }
        : { channel: event.channel ?? "", ts: event.message_ts ?? "" };

    await chatUnfurl(botToken, target, unfurls);
  } catch (err) {
    // Never throw back to Slack; just log (no secrets).
    console.warn("[slack] unfurl failed:", err instanceof Error ? err.message : "unknown");
  }
}

export async function POST(request: Request) {
  const config = getSlackConfig();
  if (!config) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rawBody = await request.text();
  if (!verifySlackRequest(rawBody, request.headers, config.signingSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let envelope: SlackEnvelope;
  try {
    envelope = JSON.parse(rawBody) as SlackEnvelope;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // One-time endpoint verification handshake.
  if (envelope.type === "url_verification") {
    return NextResponse.json({ challenge: envelope.challenge });
  }

  // Slack retries on any non-200 / slow response. We ack-then-fire, so a retry
  // would only duplicate work — short-circuit it.
  if (request.headers.get("x-slack-retry-num")) {
    return new NextResponse(null, {
      status: 200,
      headers: { "x-slack-no-retry": "1" },
    });
  }

  const event = envelope.event;
  if (envelope.type === "event_callback" && event?.type === "link_shared") {
    const links = (event.links ?? []).filter((l) =>
      EVENT_LINK_RE.test(l.url ?? "")
    );
    if (links.length === 0) {
      return new NextResponse(null, { status: 200 });
    }
    // Ack immediately; do the reads + unfurl in the background.
    after(() => doUnfurl(event, links, config.botToken));
    return new NextResponse(null, { status: 200 });
  }

  return new NextResponse(null, { status: 200 });
}
