import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rsvpSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = rsvpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const r = parsed.data;

  const { data, error } = await supabase
    .from("ec_rsvps")
    .upsert(
      {
        event_id: r.eventId,
        user_id: user.id,
        // Anyone who joins a destination is simply a participant.
        status: "going",
        eta: r.eta ?? null,
        share_location: r.shareLocation,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "event_id,user_id" }
    )
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // Joining shares the destination to this user, so refresh their list.
  revalidatePath("/events");
  return NextResponse.json({ rsvp: data }, { status: 200 });
}
