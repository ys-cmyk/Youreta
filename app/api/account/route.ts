import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Permanently delete the signed-in user's account. Calls the `ec_delete_account`
// RPC (a security-definer function that deletes only auth.uid()'s own
// auth.users row); the on-delete-cascade foreign keys remove their profile,
// hosted destinations, participations, check-ins, and location pings.
// Required by Apple App Store guideline 5.1.1(v).
export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { error } = await supabase.rpc("ec_delete_account");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Best-effort: clear the (now-orphaned) session cookie. The account is
  // already gone regardless, so a failure here must not fail the request.
  await supabase.auth.signOut().catch(() => {});

  return NextResponse.json({ ok: true }, { status: 200 });
}
