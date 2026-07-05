import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EventDetailClient from "./EventDetailClient";
import type { EventRow, LocationPing, Participant, Profile, Rsvp } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  // Fetch everything in one parallel round-trip. Pings are bounded to the live
  // window (the client's poll uses the same cutoff) — without the filter this
  // query grows unboundedly as people share.
  //
  // The event comes via the ec_get_event RPC rather than a table select: the
  // ec_events select policy is members-only, but "the link is the key" — any
  // signed-in holder of the unguessable UUID may load this one event. For a
  // not-yet-member the rsvps/pings queries legitimately return empty; the
  // client then auto-joins and refreshes, at which point they're a member and
  // both fill in.
  const pingCutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  const [{ data: event }, { data: rsvps }, { data: pings }] = await Promise.all([
    supabase.rpc("ec_get_event", { eid: id }).maybeSingle<EventRow>(),
    supabase.from("ec_rsvps").select("*").eq("event_id", id).returns<Rsvp[]>(),
    supabase
      .from("ec_location_pings")
      .select("*")
      .eq("event_id", id)
      .gte("created_at", pingCutoff)
      .order("created_at", { ascending: false })
      .limit(500)
      .returns<LocationPing[]>(),
  ]);
  if (!event) notFound();

  const userIds = Array.from(new Set((rsvps ?? []).map((r) => r.user_id)));
  const { data: profiles } = userIds.length
    ? await supabase.from("ec_profiles").select("*").in("id", userIds).returns<Profile[]>()
    : { data: [] as Profile[] };

  const nameOf = (uid: string) => {
    const p = (profiles ?? []).find((x) => x.id === uid);
    return p?.display_name || p?.email || "Guest";
  };
  const latestPingOf = (uid: string) =>
    (pings ?? []).find((p) => p.user_id === uid) ?? null;

  const participants: Participant[] = (rsvps ?? []).map((r) => ({
    rsvp: r,
    name: nameOf(r.user_id),
    lastPing: latestPingOf(r.user_id),
  }));

  const myRsvp = (rsvps ?? []).find((r) => r.user_id === user.id) ?? null;

  return (
    <EventDetailClient
      event={event}
      currentUserId={user.id}
      isHost={event.host_id === user.id}
      initialParticipants={participants}
      initialMyRsvp={myRsvp}
    />
  );
}
