import { z } from "zod";
import { MAX_RADIUS_M, MIN_RADIUS_M } from "./constants";

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

export const createEventSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).optional().nullable(),
    venueName: z.string().trim().max(160).optional().nullable(),
    venueAddress: z.string().trim().max(300).optional().nullable(),
    lat,
    lng,
    geofenceRadiusM: z.number().int().min(MIN_RADIUS_M).max(MAX_RADIUS_M),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }).optional().nullable(),
  })
  .strict();

export const rsvpSchema = z
  .object({
    eventId: z.string().uuid(),
    status: z.enum(["going", "maybe", "declined"]),
    eta: z.string().datetime({ offset: true }).optional().nullable(),
    shareLocation: z.boolean(),
  })
  .strict();

export const checkinSchema = z
  .object({
    eventId: z.string().uuid(),
    lat,
    lng,
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
export type CheckinInput = z.infer<typeof checkinSchema>;
export type PingInput = z.infer<typeof pingSchema>;
