import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EditDestinationClient from "./EditDestinationClient";
import type { EventRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EditDestinationPage({
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

  // Only the host can edit; send everyone else back to the destination.
  if (event.host_id !== user.id) redirect(`/events/${id}`);

  return <EditDestinationClient event={event} />;
}
