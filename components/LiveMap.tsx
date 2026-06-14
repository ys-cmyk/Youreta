"use client";

import { MapContainer, TileLayer, Marker, Circle, CircleMarker, Popup } from "react-leaflet";
import "./leaflet-setup";

const OSM_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTR = '&copy; OpenStreetMap contributors';

export type LivePerson = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  stale: boolean;
  distanceLabel: string;
};

export default function LiveMap({
  venue,
  radiusM,
  people,
}: {
  venue: { lat: number; lng: number };
  radiusM: number;
  people: LivePerson[];
}) {
  return (
    <div className="h-80 overflow-hidden rounded-xl border border-white/10">
      <MapContainer
        center={[venue.lat, venue.lng]}
        zoom={14}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer url={OSM_URL} attribution={OSM_ATTR} />
        <Marker position={[venue.lat, venue.lng]}>
          <Popup>Venue</Popup>
        </Marker>
        <Circle
          center={[venue.lat, venue.lng]}
          radius={radiusM}
          pathOptions={{ color: "#6366f1", fillColor: "#6366f1", fillOpacity: 0.08 }}
        />
        {people.map((p) => (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            radius={8}
            pathOptions={{
              color: p.stale ? "#6b7280" : "#10b981",
              fillColor: p.stale ? "#6b7280" : "#10b981",
              fillOpacity: 0.9,
            }}
          >
            <Popup>
              <strong>{p.name}</strong>
              <br />
              {p.distanceLabel} away{p.stale ? " · stale" : ""}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
