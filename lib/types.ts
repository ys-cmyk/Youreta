export type RsvpStatus = "going" | "maybe" | "declined";

export type LocationType = "in_person" | "virtual";
export type EventVisibility = "public" | "unlisted" | "private";

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
  // --- Luma parity (all additive, nullable / defaulted) ---
  cover_image_url: string | null;
  location_type: LocationType;
  virtual_url: string | null;
  timezone: string | null;
  capacity: number | null;
  waitlist_enabled: boolean;
  requires_approval: boolean;
  visibility: EventVisibility;
  is_paid: boolean;
  price_cents: number | null;
  currency: string | null;
  category: string | null;
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
