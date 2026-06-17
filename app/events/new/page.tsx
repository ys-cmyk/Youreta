"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import PlaceAutocomplete, { type PlaceResult } from "@/components/PlaceAutocomplete";

const MapPicker = dynamic(() => import("@/components/MapPicker"), {
  ssr: false,
  loading: () => (
    <div className="h-56 animate-pulse rounded-xl border border-white/10 bg-card" />
  ),
});

const inputClass =
  "w-full rounded-lg border border-white/15 bg-transparent px-3 py-2.5 text-white placeholder-gray-500 focus:border-transparent focus:ring-2 focus:ring-accent";

export default function NewDestinationPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [place, setPlace] = useState<PlaceResult | null>(null);
  const [name, setName] = useState("");

  // "Import from Luma" — paste a public lu.ma event link and prefill the form.
  const [lumaUrl, setLumaUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [lumaError, setLumaError] = useState("");
  const [imported, setImported] = useState(false);

  async function handleImport() {
    setLumaError("");
    const url = lumaUrl.trim();
    if (!url) {
      setLumaError("Paste a lu.ma event link first.");
      return;
    }
    setImporting(true);
    setImported(false);
    try {
      const res = await fetch("/api/luma", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok) {
        setLumaError(json.error ?? "Couldn't import that Luma link.");
        return;
      }
      const label: string = json.title || json.venueName || "Destination";
      setPlace({
        label,
        address: json.venueAddress || "",
        lat: json.lat,
        lng: json.lng,
      });
      setName(json.title || "");
      setImported(true);
    } catch {
      setLumaError("Network error — try again.");
    } finally {
      setImporting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!place) {
      setError("Search for and select a destination.");
      return;
    }
    setSubmitting(true);

    const res = await fetch("/api/events", {
      method: "POST",
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
      setError(json.error ?? "Could not create destination.");
      return;
    }
    router.push(`/events/${json.id}`);
    // Drop any cached (pre-creation) copy of the destinations list so the new
    // one reliably shows when the user navigates back to it.
    router.refresh();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">New destination</h1>
      <p className="mt-1 text-sm text-gray-400">
        Pick a place, share the link, and track each other on the way.
      </p>

      <div className="mt-6 rounded-xl border border-white/10 bg-card p-4">
        <label className="mb-1 block text-sm text-gray-400">
          Import from Luma
        </label>
        <div className="flex gap-2">
          <input
            type="url"
            inputMode="url"
            value={lumaUrl}
            onChange={(e) => {
              setLumaUrl(e.target.value);
              setLumaError("");
              setImported(false);
            }}
            placeholder="https://lu.ma/your-event"
            className={inputClass}
          />
          <button
            type="button"
            onClick={handleImport}
            disabled={importing}
            className="shrink-0 rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-50"
          >
            {importing ? "Importing…" : "Import"}
          </button>
        </div>
        {lumaError && <p className="mt-2 text-sm text-red-400">{lumaError}</p>}
        {imported && !lumaError && (
          <p className="mt-2 text-sm text-emerald-400">
            Imported — review the details below and create the destination.
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div>
          <label className="mb-1 block text-sm text-gray-400">Destination</label>
          <PlaceAutocomplete onSelect={setPlace} />
          {place && (
            <p className="mt-1 text-xs text-gray-500">
              {imported && <span className="text-white">{place.label} — </span>}
              {place.address || `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`}
            </p>
          )}
        </div>

        {place && (
          <MapPicker value={{ lat: place.lat, lng: place.lng }} />
        )}

        <div>
          <label className="mb-1 block text-sm text-gray-400">
            Name (optional)
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={place?.label ?? "Defaults to the place name"}
            className={inputClass}
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full bg-accent px-4 py-3 font-semibold text-white hover:bg-accent-bright disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create destination"}
        </button>
      </form>
    </div>
  );
}
