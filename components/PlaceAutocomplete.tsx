"use client";

import { useEffect, useRef, useState } from "react";

// Keyless address type-ahead backed by Photon (https://photon.komoot.io), an
// OpenStreetMap-based geocoder that needs no API key. The selected suggestion
// is reported as { label, lat, lng, address }.
//
// To swap in Google Places later: replace the fetch + parsing in `search()`
// with the Places Autocomplete / Place Details calls (and add the Google
// endpoint to connect-src in next.config.ts), keeping this component's
// onSelect contract unchanged.

export type PlaceResult = {
  label: string;
  lat: number;
  lng: number;
  address: string;
};

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
    osm_id?: number;
  };
};

function describe(p: PhotonFeature["properties"]): { label: string; address: string } {
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  const locality = [p.city, p.state, p.country].filter(Boolean).join(", ");
  const addressParts = [street, locality].filter(Boolean);
  const address = addressParts.join(", ");
  const label = p.name || street || locality || "Unnamed place";
  return { label, address };
}

export default function PlaceAutocomplete({
  onSelect,
  placeholder = "Search for a place or address…",
}: {
  onSelect: (place: PlaceResult | null) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // When a result has been chosen we suppress the next debounced search so the
  // dropdown doesn't reopen against the filled-in label.
  const skipNextSearch = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }

    const controller = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error("geocoder error");
        const json = (await res.json()) as { features: PhotonFeature[] };
        const next: PlaceResult[] = (json.features ?? []).map((f) => {
          const [lng, lat] = f.geometry.coordinates;
          const { label, address } = describe(f.properties);
          return { label, address, lat, lng };
        });
        setResults(next);
        setOpen(true);
      } catch {
        // Ignore aborts and transient network/geocoder errors.
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query]);

  // Close the dropdown on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function choose(place: PlaceResult) {
    skipNextSearch.current = true;
    setQuery(place.address ? `${place.label} — ${place.address}` : place.label);
    setOpen(false);
    setResults([]);
    onSelect(place);
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onSelect(null);
        }}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className="input pr-10"
        autoComplete="off"
      />
      {loading && (
        <span
          aria-hidden
          className="spinner absolute right-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500"
        />
      )}
      {open && results.length > 0 && (
        <ul className="ec-expand absolute z-[1100] mt-2 w-full divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 bg-card shadow-xl shadow-black/40">
          {results.map((r, i) => (
            <li key={`${r.lat},${r.lng},${i}`}>
              <button
                type="button"
                onClick={() => choose(r)}
                className="block w-full px-3.5 py-2.5 text-left transition-colors duration-150 hover:bg-white/5 focus-visible:[outline-offset:-2px]"
              >
                <div className="truncate text-sm font-medium text-white">{r.label}</div>
                {r.address && (
                  <div className="truncate text-xs text-gray-400">{r.address}</div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
