import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
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

  // Title falls back to the place name; ensure something non-empty since the
  // column is NOT NULL.
  const title = (e.title?.trim() || e.venueName?.trim() || "Destination") as string;

  const { data, error } = await supabase
    .from("ec_events")
    .insert({
      host_id: user.id,
      title,
      venue_name: e.venueName ?? null,
      venue_address: e.venueAddress ?? null,
      lat: e.lat,
      lng: e.lng,
      // starts_at is NOT NULL; this app no longer uses it, so anchor to now.
      starts_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // Make sure the destinations list reflects the new row on next navigation.
  revalidatePath("/events");
  return NextResponse.json({ id: data.id }, { status: 201 });
}
