import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Compute a driving travel time between two coordinates for the "live ETA"
// feature. This runs server-side so the browser only ever talks to our own
// origin (no CSP change needed for the upstream router).
//
// Today we use OSRM's free public router — no API key required. To swap in
// Google's Routes API later, replace the fetch below with a server-side call
// using a GOOGLE_MAPS_API_KEY env var and map its response
// (routes[0].duration / distanceMeters) onto the same { durationSec, distanceM }
// shape returned here. Because it stays server-side, no next.config.ts CSP
// change is ever required.

const isFiniteNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const validLat = (v: number) => v >= -90 && v <= 90;
const validLng = (v: number) => v >= -180 && v <= 180;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const from = body?.from;
  const to = body?.to;
  if (
    !from ||
    !to ||
    !isFiniteNum(from.lat) ||
    !isFiniteNum(from.lng) ||
    !isFiniteNum(to.lat) ||
    !isFiniteNum(to.lng) ||
    !validLat(from.lat) ||
    !validLng(from.lng) ||
    !validLat(to.lat) ||
    !validLng(to.lng)
  ) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?overview=false&alternatives=false&steps=false`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Youreta/1.0 (live-eta)" },
    });
    if (!res.ok) {
      return NextResponse.json({ durationSec: null }, { status: 200 });
    }
    const json = await res.json();
    const route = json?.routes?.[0];
    if (!route || !isFiniteNum(route.duration)) {
      return NextResponse.json({ durationSec: null }, { status: 200 });
    }
    return NextResponse.json(
      {
        durationSec: route.duration,
        distanceM: isFiniteNum(route.distance) ? route.distance : null,
      },
      { status: 200 }
    );
  } catch {
    // Timeout / network / parse failure — degrade gracefully so the client
    // keeps its last known ETA.
    return NextResponse.json({ durationSec: null }, { status: 200 });
  } finally {
    clearTimeout(timeout);
  }
}
