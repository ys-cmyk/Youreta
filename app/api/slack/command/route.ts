import { NextResponse } from "next/server";
import { getSlackConfig, verifySlackRequest, buildCommandBlocks } from "@/lib/slack";
import { getBotHostId, createAdminClient } from "@/lib/slack-host";
import { geocodePlace } from "@/lib/geocode";

// Slash command handler for `/eta <place>`.
//
// The whole endpoint is env-gated: without SLACK_SIGNING_SECRET +
// SLACK_BOT_TOKEN it returns 404 (the integration simply does not exist). Slack
// signs the RAW body, so we read request.text() first and verify before parsing.
//
// User-facing failures (bad place, DB error) always return an EPHEMERAL 200 JSON
// message — never a 5xx — so the user sees a friendly note instead of Slack's
// "dispatch_failed". Only signature/auth failures return non-200.

// Ephemeral (only-you) Slack response helper.
function ephemeral(text: string) {
  return NextResponse.json({ response_type: "ephemeral", text });
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

  const params = new URLSearchParams(rawBody);
  const text = (params.get("text") ?? "").trim();
  const userId = params.get("user_id") ?? "";
  const teamId = params.get("team_id") ?? "";

  // Optional single-workspace pinning: reject commands from other teams.
  const pinnedTeam = process.env.SLACK_TEAM_ID;
  if (pinnedTeam && teamId !== pinnedTeam) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!text) {
    return ephemeral(
      "Usage: `/eta <place or address>` — e.g. `/eta blue bottle, oakland`"
    );
  }

  // Cap the query length before hitting the geocoder.
  const query = text.slice(0, 300);

  const geo = await geocodePlace(query);
  if (!geo) {
    return ephemeral(`Couldn't find *${query}* — try a fuller address.`);
  }

  try {
    const hostId = await getBotHostId();
    const admin = createAdminClient();

    // Mirror app/api/events/route.ts insert shape.
    const title = (geo.name?.trim() || query) as string;
    const { data, error } = await admin
      .from("ec_events")
      .insert({
        host_id: hostId,
        title,
        venue_name: geo.name ?? null,
        venue_address: geo.address ?? null,
        lat: geo.lat,
        lng: geo.lng,
        // starts_at is NOT NULL; anchor to now like the web create flow.
        starts_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !data) {
      return ephemeral("Something went wrong creating that destination — please try again.");
    }

    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://youreta.app";
    const url = `${base}/events/${data.id}`;

    return NextResponse.json({
      response_type: "in_channel",
      blocks: buildCommandBlocks({
        title,
        address: geo.address,
        url,
        invokerId: userId,
      }),
    });
  } catch {
    return ephemeral("Something went wrong creating that destination — please try again.");
  }
}
