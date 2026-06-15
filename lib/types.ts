export type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
};

// A destination reuses the existing ec_events table. Only the columns below are
// used by the app; the remaining DB columns stay null/default and are unused.
export type EventRow = {
  id: string;
  host_id: string;
  title: string;
  venue_name: string | null;
  venue_address: string | null;
  lat: number;
  lng: number;
  starts_at: string;
  created_at: string;
};

// A participant who joined a destination (a row in ec_rsvps). `status` is
// always 'going'; we keep the column to satisfy the existing schema.
export type Rsvp = {
  id: string;
  event_id: string;
  user_id: string;
  status: string;
  eta: string | null;
  share_location: boolean;
  created_at: string;
  updated_at: string;
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

// Enriched view used by the destination detail page / participant list.
export type Participant = {
  rsvp: Rsvp;
  name: string;
  lastPing: LocationPing | null;
};
