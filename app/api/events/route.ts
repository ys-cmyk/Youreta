import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createEventSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const e = parsed.data;

  const { data, error } = await supabase
    .from("ec_events")
    .insert({
      host_id: user.id,
      title: e.title,
      description: e.description ?? null,
      venue_name: e.venueName ?? null,
      venue_address: e.venueAddress ?? null,
      lat: e.lat,
      lng: e.lng,
      geofence_radius_m: e.geofenceRadiusM,
      starts_at: e.startsAt,
      ends_at: e.endsAt ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
}
