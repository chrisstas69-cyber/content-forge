import { z } from "zod";

export const platforms = [
  "instagram",
  "tiktok",
  "youtube",
  "facebook",
] as const;
export const platformSchema = z.enum(platforms);
export const captionCue = z
  .object({
    start: z.number().min(0),
    end: z.number().positive(),
    text: z.string().min(1).max(240),
  })
  .refine((cue) => cue.end > cue.start, "Caption end must follow its start");
export const mediaSettings = z
  .object({
    ratio: z.enum(["original", "9:16", "1:1", "16:9"]).default("original"),
    photoMode: z.enum(["photos", "slideshow"]).default("photos"),
    perImageSec: z.number().min(2).max(15).default(4),
    trimStart: z.number().min(0).max(86400).default(0),
    trimEnd: z.number().positive().max(86400).nullable().default(null),
    mute: z.boolean().default(false),
    captionCues: z
      .array(captionCue)
      .max(1500)
      .refine(
        (cues) =>
          cues.every((cue, i) => i === 0 || cue.start >= cues[i - 1].end),
        "Subtitle cues must be ordered and must not overlap",
      )
      .default([]),
  })
  .refine(
    (s) => s.trimEnd === null || s.trimEnd > s.trimStart,
    "Clip end must follow its start",
  );
export type MediaSettings = z.infer<typeof mediaSettings>;
export type Platform = (typeof platforms)[number];
export const draftInput = z.object({
  title: z.string().trim().max(100),
  caption: z.string().max(5000),
  variants: z
    .partialRecord(platformSchema, z.string().max(5000))
    .default({} as Record<Platform, string>),
  destination_ids: z.array(z.string().uuid()).max(20).default([]),
  scheduled_for: z.string().datetime({ offset: true }).nullable().default(null),
});
export function validatePost(
  input: {
    title: string;
    caption: string;
    variants: Record<string, string>;
    scheduled_for: string | null;
  },
  targets: { platform: string }[],
  kind: string,
  count: number,
) {
  if (!targets.length)
    throw new Error("Choose at least one connected account for this brand.");
  if (
    input.scheduled_for &&
    Date.parse(input.scheduled_for) < Date.now() + 60000
  )
    throw new Error("Choose a schedule at least one minute in the future.");
  for (const target of targets) {
    const text = input.variants[target.platform] || input.caption;
    if (!text.trim())
      throw new Error(`Write a caption for ${target.platform}.`);
    const limit =
      target.platform === "instagram" || target.platform === "tiktok"
        ? 2200
        : 5000;
    if (text.length > limit)
      throw new Error(
        `${target.platform} caption must be ${limit} characters or fewer.`,
      );
    if (
      target.platform === "youtube" &&
      (!["video", "slideshow"].includes(kind) || !input.title.trim())
    )
      throw new Error(
        "YouTube needs a video and a title. Turn photos into a slideshow first.",
      );
    if (target.platform === "facebook" && count > 10)
      throw new Error("Facebook supports up to 10 photos per post.");
  }
}
