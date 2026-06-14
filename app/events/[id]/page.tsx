import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EventDetailClient from "./EventDetailClient";
import type {
  Attendee,
  Checkin,
  EventRow,
  LocationPing,
  Profile,
  Rsvp,
} from "@/lib/types";

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

  const { data: event } = await supabase
    .from("ec_events")
    .select("*")
    .eq("id", id)
    .maybeSingle<EventRow>();
  if (!event) notFound();

  const [{ data: rsvps }, { data: checkins }, { data: pings }] = await Promise.all([
    supabase.from("ec_rsvps").select("*").eq("event_id", id).returns<Rsvp[]>(),
    supabase.from("ec_checkins").select("*").eq("event_id", id).returns<Checkin[]>(),
    supabase
      .from("ec_location_pings")
      .select("*")
      .eq("event_id", id)
      .order("created_at", { ascending: false })
      .returns<LocationPing[]>(),
  ]);

  const userIds = Array.from(new Set((rsvps ?? []).map((r) => r.user_id)));
  const { data: profiles } = userIds.length
    ? await supabase.from("ec_profiles").select("*").in("id", userIds).returns<Profile[]>()
    : { data: [] as Profile[] };

  const nameOf = (uid: string) => {
    const p = (profiles ?? []).find((x) => x.id === uid);
    return p?.display_name || p?.email || "Guest";
  };
  const checkinOf = (uid: string) =>
    (checkins ?? []).find((c) => c.user_id === uid) ?? null;
  const latestPingOf = (uid: string) =>
    (pings ?? []).find((p) => p.user_id === uid) ?? null;

  const attendees: Attendee[] = (rsvps ?? []).map((r) => ({
    rsvp: r,
    name: nameOf(r.user_id),
    checkin: checkinOf(r.user_id),
    lastPing: latestPingOf(r.user_id),
  }));

  const myRsvp = (rsvps ?? []).find((r) => r.user_id === user.id) ?? null;

  return (
    <EventDetailClient
      event={event}
      currentUserId={user.id}
      isHost={event.host_id === user.id}
      initialAttendees={attendees}
      initialMyRsvp={myRsvp}
    />
  );
}
