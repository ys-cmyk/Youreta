"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import "./leaflet-setup";

type LatLng = { lat: number; lng: number };

const CARTO_URL =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const CARTO_ATTR = "&copy; OpenStreetMap contributors &copy; CARTO";

// Keep the map centered on the currently-selected place (e.g. after an address
// is chosen from the type-ahead).
function Recenter({ value }: { value: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (value) map.setView([value.lat, value.lng], 15);
  }, [value, map]);
  return null;
}

export default function MapPicker({ value }: { value: LatLng | null }) {
  const center: [number, number] = value ? [value.lat, value.lng] : [37.7749, -122.4194];

  return (
    <div className="h-56 overflow-hidden rounded-2xl border border-white/10 shadow-lg shadow-black/30">
      <MapContainer
        center={center}
        zoom={value ? 15 : 11}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer url={CARTO_URL} attribution={CARTO_ATTR} subdomains="abcd" />
        <Recenter value={value} />
        {value && <Marker position={[value.lat, value.lng]} />}
      </MapContainer>
    </div>
  );
}
