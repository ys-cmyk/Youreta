"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import PlaceAutocomplete, { type PlaceResult } from "@/components/PlaceAutocomplete";

const MapPicker = dynamic(() => import("@/components/MapPicker"), {
  ssr: false,
  loading: () => <div className="card h-56 animate-pulse" />,
});

export default function NewDestinationPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [place, setPlace] = useState<PlaceResult | null>(null);
  const [name, setName] = useState("");

  // "Import from Luma" — paste a public lu.ma event link and prefill the form.
  // Collapsed by default so picking a place stays the primary path.
  const [lumaOpen, setLumaOpen] = useState(false);
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

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-300">
            Destination
          </label>
          <PlaceAutocomplete
            onSelect={(p) => {
              setPlace(p);
              // Picking a place via search supersedes a Luma import, so clear
              // the green "Imported —" confirmation.
              setImported(false);
            }}
          />
          {place && (
            <p className="mt-1.5 text-xs text-gray-400">
              {imported && <span className="text-white">{place.label} — </span>}
              {place.address || `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`}
            </p>
          )}
        </div>

        {place && (
          <MapPicker value={{ lat: place.lat, lng: place.lng }} />
        )}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-300">
            Name <span className="font-normal text-gray-500">(optional)</span>
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={place?.label ?? "Defaults to the place name"}
            className="input"
          />
        </div>

        {error && (
          <p className="ec-expand rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="btn btn-primary min-h-12 w-full px-4 shadow-lg shadow-accent/20"
        >
          {submitting && <span className="spinner" aria-hidden />}
          {submitting ? "Creating…" : "Create destination"}
        </button>
      </form>

      {/* Secondary path: prefill from a public Luma event link. */}
      <div className="card mt-6">
        <button
          type="button"
          onClick={() => setLumaOpen((o) => !o)}
          aria-expanded={lumaOpen}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left text-sm text-gray-400 transition-colors hover:text-white"
        >
          <span>Have a Luma event? Import it</span>
          <span
            aria-hidden
            className={`text-gray-500 transition-transform duration-200 ${
              lumaOpen ? "rotate-180" : ""
            }`}
          >
            ▾
          </span>
        </button>
        {lumaOpen && (
          <div className="ec-expand px-4 pb-4">
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
                className="input"
              />
              <button
                type="button"
                onClick={handleImport}
                disabled={importing}
                className="btn btn-secondary min-h-11 shrink-0 px-4 text-sm"
              >
                {importing && <span className="spinner h-3.5 w-3.5" aria-hidden />}
                {importing ? "Importing…" : "Import"}
              </button>
            </div>
            {lumaError && (
              <p className="ec-expand mt-2 text-sm text-red-300">{lumaError}</p>
            )}
            {imported && !lumaError && (
              <p className="ec-expand mt-2 text-sm text-going">
                Imported — review the details above and create the destination.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
