export type RsvpStatus = "going" | "maybe" | "declined";

export type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
};

export type EventRow = {
  id: string;
  host_id: string;
  title: string;
  description: string | null;
  venue_name: string | null;
  venue_address: string | null;
  lat: number;
  lng: number;
  geofence_radius_m: number;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
};

export type Rsvp = {
  id: string;
  event_id: string;
  user_id: string;
  status: RsvpStatus;
  eta: string | null;
  share_location: boolean;
  created_at: string;
  updated_at: string;
};

export type Checkin = {
  id: string;
  event_id: string;
  user_id: string;
  lat: number;
  lng: number;
  distance_m: number;
  created_at: string;
};

export type LocationPing = {
  id: string;
  event_id: string;
  user_id: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  created_at: string;
};

// Enriched view used by the event detail page / attendee list.
export type Attendee = {
  rsvp: Rsvp;
  name: string;
  checkin: Checkin | null;
  lastPing: LocationPing | null;
};
