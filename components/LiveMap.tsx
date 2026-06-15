"use client";

import { MapContainer, TileLayer, Marker, CircleMarker, Popup } from "react-leaflet";
import "./leaflet-setup";

const OSM_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTR = "&copy; OpenStreetMap contributors";

export type LivePerson = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  stale: boolean;
  arrived: boolean;
  distanceLabel: string;
  etaLabel: string | null;
};

export default function LiveMap({
  destination,
  people,
}: {
  destination: { lat: number; lng: number };
  people: LivePerson[];
}) {
  return (
    <div className="h-80 overflow-hidden rounded-xl border border-white/10">
      <MapContainer
        center={[destination.lat, destination.lng]}
        zoom={14}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer url={OSM_URL} attribution={OSM_ATTR} />
        <Marker position={[destination.lat, destination.lng]}>
          <Popup>Destination</Popup>
        </Marker>
        {people.map((p) => {
          const color = p.arrived ? "#10b981" : p.stale ? "#6b7280" : "#6366f1";
          return (
            <CircleMarker
              key={p.id}
              center={[p.lat, p.lng]}
              radius={8}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.9 }}
            >
              <Popup>
                <strong>{p.name}</strong>
                <br />
                {p.arrived ? "Arrived" : `${p.distanceLabel} away`}
                {p.etaLabel ? ` · ETA ${p.etaLabel}` : ""}
                {p.stale && !p.arrived ? " · stale" : ""}
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
