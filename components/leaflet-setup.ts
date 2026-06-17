import L from "leaflet";

// Leaflet's default marker icon is loaded from bundled PNGs whose URLs often
// break under Next/Turbopack, showing a broken "?" image. Use an image-free
// divIcon pin as the default for every Marker so the destination renders
// reliably. (Participants on the live map use CircleMarkers, not this.)
const pin = L.divIcon({
  className: "yeta-pin",
  html:
    '<div style="font-size:30px;line-height:1;' +
    'filter:drop-shadow(0 2px 3px rgba(0,0,0,0.5))">📍</div>',
  iconSize: [30, 30],
  iconAnchor: [15, 28],
  popupAnchor: [0, -26],
});

L.Marker.prototype.options.icon = pin;
