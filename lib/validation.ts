import { z } from "zod";

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

// Creating a destination: just a place (lat/lng + labels) and an optional name.
export const createEventSchema = z
  .object({
    title: z.string().trim().max(120).optional().nullable(),
    venueName: z.string().trim().max(160).optional().nullable(),
    venueAddress: z.string().trim().max(300).optional().nullable(),
    lat,
    lng,
  })
  .strict();

// Joining / updating participation. Status is always 'going' server-side.
export const rsvpSchema = z
  .object({
    eventId: z.string().uuid(),
    eta: z.string().datetime({ offset: true }).optional().nullable(),
    shareLocation: z.boolean(),
  })
  .strict();

export const pingSchema = z
  .object({
    eventId: z.string().uuid(),
    lat,
    lng,
    accuracyM: z.number().nonnegative().optional().nullable(),
  })
  .strict();

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type RsvpInput = z.infer<typeof rsvpSchema>;
export type PingInput = z.infer<typeof pingSchema>;
