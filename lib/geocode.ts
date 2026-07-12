// Shared server-side geocoder built on the Photon (Komoot) engine — the same
// engine the app uses for its address type-ahead and the Luma importer. Given a
// free-text place or address, it returns coordinates plus (when available) a
// human place name and a formatted address assembled from the feature's
// properties. Returns null on any failure (network, timeout, empty result) so
// callers can degrade gracefully. No API key required.

export type GeocodeResult = {
  lat: number;
  lng: number;
  name: string | null;
  address: string | null;
};

// Photon feature properties we care about. All optional — Photon omits fields
// it doesn't have for a given match.
type PhotonProps = {
  name?: string;
  housenumber?: string;
  street?: string;
  city?: string;
  state?: string;
  country?: string;
};

function assembleAddress(props: PhotonProps): string | null {
  const line1 = [props.housenumber, props.street].filter(Boolean).join(" ").trim();
  const parts = [line1, props.city, props.state, props.country]
    .map((p) => (p ? p.trim() : ""))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export async function geocodePlace(query: string): Promise<GeocodeResult | null> {
  if (!query.trim()) return null;

  // 2s cap: the slash command must ack within Slack's 3s window, so the geocode
  // cannot hang. AbortController fires abort() after the timeout.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`,
      {
        headers: { "User-Agent": "YourETA/1.0 (+https://youreta.vercel.app)" },
        signal: controller.signal,
      }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      features?: {
        geometry?: { coordinates?: [number, number] };
        properties?: PhotonProps;
      }[];
    };
    const feature = json.features?.[0];
    const coords = feature?.geometry?.coordinates;
    if (!coords) return null;
    const [lng, lat] = coords;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const props = feature?.properties ?? {};
    return {
      lat,
      lng,
      name: props.name?.trim() || null,
      address: assembleAddress(props),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
