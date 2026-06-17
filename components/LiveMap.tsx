"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
  useMap,
} from "react-leaflet";
import "./leaflet-setup";

const CARTO_URL =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const CARTO_ATTR = "&copy; OpenStreetMap contributors &copy; CARTO";

const ACCENT = "#6366f1";
const GOING = "#10b981";
const STALE = "#6b7280";

export type LivePerson = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  stale: boolean;
  arrived: boolean;
  distanceLabel: string;
  etaLabel: string | null;
  isMe?: boolean;
};

// 1–2 uppercase initials derived from a person's name (ignoring a trailing
// "(you)" suffix added upstream).
function initials(name: string): string {
  const clean = name.replace(/\s*\(you\)\s*$/i, "").trim();
  if (!clean) return "?";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function personColor(p: LivePerson): string {
  if (p.arrived) return GOING;
  if (p.stale) return STALE;
  return ACCENT;
}

const destIcon = L.divIcon({
  className: "yeta-dest",
  html: '<div class="yeta-dest-inner"><span>📍</span></div>',
  iconSize: [30, 30],
  iconAnchor: [15, 28],
  popupAnchor: [0, -28],
});

// Keep the destination and everyone converging in view. Refit only when the set
// of people changes (someone joins/leaves) — not on every position tick — so the
// map doesn't constantly jitter as people move closer.
function FitBounds({
  destination,
  people,
}: {
  destination: { lat: number; lng: number };
  people: LivePerson[];
}) {
  const map = useMap();
  const idsKey = useMemo(
    () => people.map((p) => p.id).sort().join(","),
    [people]
  );
  useEffect(() => {
    const points: [number, number][] = [
      [destination.lat, destination.lng],
      ...people.map((p) => [p.lat, p.lng] as [number, number]),
    ];
    if (points.length === 1) {
      map.setView(points[0], 15, { animate: true });
    } else {
      map.fitBounds(L.latLngBounds(points), {
        padding: [56, 56],
        maxZoom: 16,
        animate: true,
      });
    }
    // Refit on membership change only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);
  return null;
}

export default function LiveMap({
  destination,
  people,
}: {
  destination: { lat: number; lng: number };
  people: LivePerson[];
}) {
  const personIcons = useMemo(() => {
    const map = new Map<string, L.DivIcon>();
    for (const p of people) {
      const color = personColor(p);
      // Pulse only for people actively sharing (fresh, not stale, not arrived).
      const live = !p.stale && !p.arrived;
      const classes = [
        "yeta-avatar",
        live ? "yeta-avatar-live" : "",
        p.isMe ? "yeta-avatar-me" : "",
      ]
        .filter(Boolean)
        .join(" ");
      map.set(
        p.id,
        L.divIcon({
          className: classes,
          html: `<div class="yeta-avatar-inner" style="background:${color};color:${color}"><span style="color:#fff">${initials(
            p.name
          )}</span></div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
          popupAnchor: [0, -18],
        })
      );
    }
    return map;
  }, [people]);

  return (
    <div className="h-[26rem] overflow-hidden rounded-2xl border border-white/10 shadow-lg shadow-black/30">
      <MapContainer
        center={[destination.lat, destination.lng]}
        zoom={14}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          url={CARTO_URL}
          attribution={CARTO_ATTR}
          subdomains="abcd"
        />
        <FitBounds destination={destination} people={people} />

        {/* Connecting lines from each person to the destination. */}
        {people.map((p) =>
          p.arrived ? null : (
            <Polyline
              key={`line-${p.id}`}
              positions={[
                [p.lat, p.lng],
                [destination.lat, destination.lng],
              ]}
              pathOptions={{
                color: personColor(p),
                weight: 2,
                opacity: 0.35,
                dashArray: "4 6",
              }}
            />
          )
        )}

        <Marker position={[destination.lat, destination.lng]} icon={destIcon}>
          <Popup>Destination</Popup>
        </Marker>

        {people.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={personIcons.get(p.id)}
          >
            <Popup>
              <strong>{p.name}</strong>
              <br />
              {p.arrived ? "Arrived" : `${p.distanceLabel} away`}
              {p.etaLabel ? ` · ETA ${p.etaLabel}` : ""}
              {p.stale && !p.arrived ? " · stale" : ""}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
