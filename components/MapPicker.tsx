"use client";

import { MapContainer, TileLayer, Marker, Circle, useMapEvents } from "react-leaflet";
import "./leaflet-setup";

type LatLng = { lat: number; lng: number };

const OSM_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTR = '&copy; OpenStreetMap contributors';

function ClickHandler({ onChange }: { onChange: (c: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onChange({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

export default function MapPicker({
  value,
  onChange,
  radiusM,
}: {
  value: LatLng | null;
  onChange: (c: LatLng) => void;
  radiusM: number;
}) {
  // Default to a sensible world view; user clicks to place the pin.
  const center: [number, number] = value ? [value.lat, value.lng] : [37.7749, -122.4194];

  return (
    <div className="h-72 overflow-hidden rounded-xl border border-white/10">
      <MapContainer
        center={center}
        zoom={value ? 15 : 11}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer url={OSM_URL} attribution={OSM_ATTR} />
        <ClickHandler onChange={onChange} />
        {value && (
          <>
            <Marker position={[value.lat, value.lng]} />
            <Circle
              center={[value.lat, value.lng]}
              radius={radiusM}
              pathOptions={{ color: "#6366f1", fillColor: "#6366f1", fillOpacity: 0.12 }}
            />
          </>
        )}
      </MapContainer>
    </div>
  );
}
