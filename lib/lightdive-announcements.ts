// Lightdive observatory announcements: written by the administrator in /admin/lightdive (signed
// admin action "lightdive-announcements"), stored in the settings table, read publicly by the game.
import { z } from "zod";

export const ANNOUNCEMENTS_KEY = "lightdive:announcements";
export const ANNOUNCEMENT_KINDS = ["news", "event", "update", "maintenance"] as const;
export const MAX_ANNOUNCEMENTS = 20;

const httpsUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || /^https:\/\/[^\s]+$/i.test(v), "Links must start with https://");

export const announcementSchema = z
  .object({
    id: z.string().trim().min(1).max(40),
    kind: z.enum(ANNOUNCEMENT_KINDS),
    title: z.string().trim().min(1).max(80),
    body: z.string().trim().max(600),
    titleEn: z.string().trim().max(80).default(""),
    bodyEn: z.string().trim().max(600).default(""),
    link: httpsUrl.default(""),
    pinned: z.boolean().default(false),
    /** Unix seconds; 0 = no limit. */
    startsAt: z.number().int().nonnegative().default(0),
    endsAt: z.number().int().nonnegative().default(0),
  })
  .strict();

export type Announcement = z.infer<typeof announcementSchema>;
export const announcementListSchema = z.object({ items: z.array(announcementSchema).max(MAX_ANNOUNCEMENTS) }).strict();

/** Announcements visible at `now`: within their window, pinned first, newest start first. */
export function activeAnnouncements(items: Announcement[], now: number): Announcement[] {
  return items
    .filter((a) => (a.startsAt === 0 || a.startsAt <= now) && (a.endsAt === 0 || a.endsAt > now))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.startsAt - a.startsAt);
}
