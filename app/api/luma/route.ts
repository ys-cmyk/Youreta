import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Import a destination from a public Luma (lu.ma) event page — no Luma API and
// no API key. We fetch the public HTML server-side, read JSON-LD Event data,
// and (if needed) geocode the address with the same Photon engine the app uses
// for the address type-ahead.

type PostalAddress = {
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
  addressCountry?: string;
};

type LdLocation =
  | string
  | {
      name?: string;
      address?: string | PostalAddress;
      geo?: { latitude?: number | string; longitude?: number | string };
    };

type LdEvent = {
  "@type"?: string | string[];
  name?: string;
  startDate?: string;
  location?: LdLocation;
};

// Only ever fetch lu.ma (or its subdomains) over https. This is the critical
// SSRF guard: never fetch an arbitrary host supplied by the client.
function isAllowedLumaUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  if (host !== "lu.ma" && !host.endsWith(".lu.ma")) return null;
  return url;
}

function toNumber(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

// Walk a parsed JSON-LD value (which may be an object, an array, or contain an
// @graph) and return the first object whose @type is "Event".
function findEvent(node: unknown): LdEvent | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = findEvent(entry);
      if (found) return found;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  const t = obj["@type"];
  const isEvent = Array.isArray(t) ? t.includes("Event") : t === "Event";
  if (isEvent) return obj as LdEvent;
  if (obj["@graph"]) return findEvent(obj["@graph"]);
  return null;
}

function formatAddress(address?: string | PostalAddress): string {
  if (!address) return "";
  if (typeof address === "string") return address;
  return [
    address.streetAddress,
    address.addressLocality,
    address.addressRegion,
    address.postalCode,
    address.addressCountry,
  ]
    .filter(Boolean)
    .join(", ");
}

function extractMeta(html: string, property: string): string | null {
  // Match <meta property="og:title" content="..."> in either attribute order.
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`,
    "i"
  );
  const m = re.exec(html);
  if (m) return m[1];
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`,
    "i"
  );
  const m2 = re2.exec(html);
  return m2 ? m2[1] : null;
}

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address.trim()) return null;
  try {
    const res = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(address)}&limit=1`,
      { headers: { "User-Agent": "YourETA/1.0 (+https://youreta.vercel.app)" } }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      features?: { geometry?: { coordinates?: [number, number] } }[];
    };
    const coords = json.features?.[0]?.geometry?.coordinates;
    if (!coords) return null;
    const [lng, lat] = coords;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { url?: string } | null;
  const rawUrl = body?.url?.trim();
  if (!rawUrl) {
    return NextResponse.json({ error: "Paste a Luma event link." }, { status: 400 });
  }

  const url = isAllowedLumaUrl(rawUrl);
  if (!url) {
    return NextResponse.json(
      { error: "That doesn't look like a lu.ma event link." },
      { status: 400 }
    );
  }

  // Fetch the public event page with an ~8s timeout.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let html: string;
  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; YourETA/1.0; +https://youreta.vercel.app)",
        Accept: "text/html",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: "Couldn't load that Luma page." },
        { status: 422 }
      );
    }
    html = await res.text();
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach that Luma link — check the URL and try again." },
      { status: 422 }
    );
  } finally {
    clearTimeout(timeout);
  }

  // Pull every JSON-LD block and look for an Event.
  let event: LdEvent | null = null;
  const ldRe =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = ldRe.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const found = findEvent(parsed);
      if (found) {
        event = found;
        break;
      }
    } catch {
      // Skip malformed JSON-LD blocks.
    }
  }

  const ogTitle = extractMeta(html, "og:title");
  const title = (event?.name || ogTitle || "").trim();

  // Resolve venue + coordinates.
  let venueName = "";
  let venueAddress = "";
  let lat: number | null = null;
  let lng: number | null = null;

  const loc = event?.location;
  if (typeof loc === "string") {
    venueName = loc;
    venueAddress = loc;
  } else if (loc && typeof loc === "object") {
    venueName = loc.name?.trim() ?? "";
    venueAddress = formatAddress(loc.address);
    if (loc.geo) {
      const gLat = toNumber(loc.geo.latitude);
      const gLng = toNumber(loc.geo.longitude);
      if (gLat !== null && gLng !== null) {
        lat = gLat;
        lng = gLng;
      }
    }
  }

  // Fall back to geocoding the address (or venue name) if we have no coordinates.
  if (lat === null || lng === null) {
    const query = venueAddress || venueName;
    const geo = await geocode(query);
    if (geo) {
      lat = geo.lat;
      lng = geo.lng;
    }
  }

  if (lat === null || lng === null) {
    return NextResponse.json(
      {
        error:
          "Couldn't read a location from that Luma link — try entering the address manually.",
      },
      { status: 422 }
    );
  }

  return NextResponse.json({
    title: title || venueName || "Destination",
    venueName,
    venueAddress,
    lat,
    lng,
  });
}
