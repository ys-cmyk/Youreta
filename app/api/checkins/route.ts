import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkinSchema } from "@/lib/validation";
import { distanceMeters } from "@/lib/geo";

// The trust boundary: the client claims a position, but the server recomputes
// the distance to the venue and refuses to record a check-in outside the
// geofence. A malicious client cannot fake being "here".
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = checkinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { eventId, lat, lng } = parsed.data;

  const { data: event, error: eventErr } = await supabase
    .from("ec_events")
    .select("lat, lng, geofence_radius_m")
    .eq("id", eventId)
    .single();
  if (eventErr || !event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Must have RSVP'd before checking in.
  const { data: rsvp } = await supabase
    .from("ec_rsvps")
    .select("id")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!rsvp) {
    return NextResponse.json(
      { ok: false, error: "RSVP to this event before checking in." },
      { status: 403 }
    );
  }

  const distance = distanceMeters(
    { lat, lng },
    { lat: event.lat, lng: event.lng }
  );
  const radius = event.geofence_radius_m;

  if (distance > radius) {
    return NextResponse.json(
      { ok: false, distance_m: distance, radius_m: radius },
      { status: 200 }
    );
  }

  const { error: insertErr } = await supabase.from("ec_checkins").upsert(
    {
      event_id: eventId,
      user_id: user.id,
      lat,
      lng,
      distance_m: distance,
    },
    { onConflict: "event_id,user_id" }
  );
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, distance_m: distance, radius_m: radius },
    { status: 200 }
  );
}
