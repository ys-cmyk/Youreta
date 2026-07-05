"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import PlaceAutocomplete, { type PlaceResult } from "@/components/PlaceAutocomplete";
import type { EventRow } from "@/lib/types";

const MapPicker = dynamic(() => import("@/components/MapPicker"), {
  ssr: false,
  loading: () => <div className="card h-56 animate-pulse" />,
});

export default function EditDestinationClient({ event }: { event: EventRow }) {
  const router = useRouter();
  const [name, setName] = useState(event.title);
  // Seed with the current location; only replaced if the host picks a new place.
  const [place, setPlace] = useState<PlaceResult>({
    label: event.venue_name || event.title,
    address: event.venue_address || "",
    lat: event.lat,
    lng: event.lng,
  });
  const [changingPlace, setChangingPlace] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const res = await fetch(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: name.trim() || place.label,
        venueName: place.label,
        venueAddress: place.address || null,
        lat: place.lat,
        lng: place.lng,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setSubmitting(false);
      setError(json.error ?? "Could not save changes.");
      return;
    }
    router.push(`/events/${event.id}`);
    router.refresh();
  }

  async function handleDelete() {
    if (
      !window.confirm(
        "Delete this destination? Everyone's ETAs and locations for it will be removed. This can't be undone."
      )
    ) {
      return;
    }
    setError("");
    setDeleting(true);
    const res = await fetch(`/api/events/${event.id}`, { method: "DELETE" });
    if (!res.ok) {
      setDeleting(false);
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Could not delete.");
      return;
    }
    router.push("/events");
    router.refresh();
  }

  return (
    <div>
      <Link
        href={`/events/${event.id}`}
        className="inline-flex min-h-8 items-center rounded-lg text-xs text-gray-400 transition-colors hover:text-white"
      >
        ← Back to {event.title}
      </Link>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">
        Edit destination
      </h1>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-300">
            Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={place.label}
            className="input"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-300">
            Destination
          </label>
          <p className="text-sm text-gray-400">
            {place.label}
            {place.address ? ` · ${place.address}` : ""}
          </p>
          {!changingPlace ? (
            <button
              type="button"
              onClick={() => setChangingPlace(true)}
              className="mt-2 inline-flex min-h-8 items-center rounded-lg text-sm font-medium text-accent-bright transition-colors hover:text-white"
            >
              Change location
            </button>
          ) : (
            <div className="ec-expand mt-2">
              <PlaceAutocomplete onSelect={(p) => p && setPlace(p)} />
            </div>
          )}
        </div>

        <MapPicker value={{ lat: place.lat, lng: place.lng }} />

        {error && (
          <p className="ec-expand rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || deleting}
          className="btn btn-primary min-h-12 w-full px-4 shadow-lg shadow-accent/20"
        >
          {submitting && <span className="spinner" aria-hidden />}
          {submitting ? "Saving…" : "Save changes"}
        </button>

        <div className="border-t border-white/10 pt-5">
          <button
            type="button"
            onClick={handleDelete}
            disabled={submitting || deleting}
            className="btn btn-danger min-h-11 w-full px-4 text-sm"
          >
            {deleting && <span className="spinner h-3.5 w-3.5" aria-hidden />}
            {deleting ? "Deleting…" : "Delete destination"}
          </button>
          <p className="mt-2 text-center text-xs text-gray-500">
            Removes everyone&apos;s ETAs and locations for this destination.
          </p>
        </div>
      </form>
    </div>
  );
}
