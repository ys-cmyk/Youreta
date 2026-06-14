import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pingSchema } from "@/lib/validation";

// Record a live location ping while a participant is en route. We only accept
// pings from users who have RSVP'd with location sharing enabled.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = pingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { eventId, lat, lng, accuracyM } = parsed.data;

  const { data: rsvp } = await supabase
    .from("ec_rsvps")
    .select("share_location")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!rsvp || !rsvp.share_location) {
    return NextResponse.json(
      { error: "Location sharing is not enabled for this event." },
      { status: 403 }
    );
  }

  const { error } = await supabase.from("ec_location_pings").insert({
    event_id: eventId,
    user_id: user.id,
    lat,
    lng,
    accuracy_m: accuracyM ?? null,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

// Latest ping per user for an event (last 15 minutes), for the live map.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const eventId = request.nextUrl.searchParams.get("eventId");
  if (!eventId) {
    return NextResponse.json({ error: "Missing eventId" }, { status: 400 });
  }

  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data, error } = await supabase
    .from("ec_location_pings")
    .select("*")
    .eq("event_id", eventId)
    .gte("created_at", since)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Reduce to the most recent ping per user.
  const latest = new Map<string, (typeof data)[number]>();
  for (const ping of data ?? []) {
    if (!latest.has(ping.user_id)) latest.set(ping.user_id, ping);
  }
  return NextResponse.json({ pings: Array.from(latest.values()) }, { status: 200 });
}
