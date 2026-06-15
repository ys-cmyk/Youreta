import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createEventSchema } from "@/lib/validation";

// Edit a destination. Host-only: the `.eq("host_id", user.id)` filter plus the
// row-level-security update policy both enforce that only the host can change it.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
  const title = (e.title?.trim() || e.venueName?.trim() || "Destination") as string;

  const { data, error } = await supabase
    .from("ec_events")
    .update({
      title,
      venue_name: e.venueName ?? null,
      venue_address: e.venueAddress ?? null,
      lat: e.lat,
      lng: e.lng,
    })
    .eq("id", id)
    .eq("host_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "Destination not found or you're not the host." },
      { status: 403 }
    );
  }

  revalidatePath("/events");
  revalidatePath(`/events/${id}`);
  return NextResponse.json({ id: data.id }, { status: 200 });
}

// Delete a destination (host-only). Cascades to its rsvps and pings.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("ec_events")
    .delete()
    .eq("id", id)
    .eq("host_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "Destination not found or you're not the host." },
      { status: 403 }
    );
  }

  revalidatePath("/events");
  return NextResponse.json({ ok: true }, { status: 200 });
}
