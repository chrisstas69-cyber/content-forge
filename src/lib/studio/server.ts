import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export class StudioError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new StudioError("Studio storage is not configured.", 503);
  return createAdminClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function studioContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new StudioError("Sign in to continue.", 401);
  const { data: membership, error } = await supabase
    .from("workspace_members")
    .select("workspace_id,role")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .single();
  if (error || !membership)
    throw new StudioError("Your workspace is not ready.", 409);
  return {
    supabase,
    db: adminClient(),
    user,
    workspace: membership.workspace_id as string,
    owner: ["owner", "admin"].includes(membership.role),
  };
}
export type StudioContext = Awaited<ReturnType<typeof studioContext>>;
export function check(error: { message: string } | null) {
  if (error) {
    console.error("Studio database request failed", error.message);
    throw new StudioError(
      "Could not save or load this item. Please retry.",
      503,
    );
  }
}
export async function scopedItem(
  ctx: StudioContext,
  table:
    | "content_items"
    | "brand_profiles"
    | "post_drafts"
    | "social_destinations",
  id: string,
) {
  const { data, error } = await ctx.db
    .from(table)
    .select("*")
    .eq("workspace_id", ctx.workspace)
    .eq("id", id)
    .single();
  if (error || !data)
    throw new StudioError("Item not found in your workspace.", 404);
  return data;
}
function encryptionKey() {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || !/^[a-fA-F0-9]{64}$/.test(hex))
    throw new StudioError("Secure integration storage is not configured.", 503);
  return Buffer.from(hex, "hex");
}
export function seal(secret: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const bytes = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString("base64");
}
export function unseal(payload: string) {
  const bytes = Buffer.from(payload, "base64"),
    cipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      bytes.subarray(0, 12),
    );
  cipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([
    cipher.update(bytes.subarray(28)),
    cipher.final(),
  ]).toString("utf8");
}
export async function integration(ctx: StudioContext, provider: string) {
  const { data, error } = await ctx.db
    .from("studio_integrations")
    .select("cipher_text")
    .eq("workspace_id", ctx.workspace)
    .eq("provider", provider)
    .maybeSingle();
  check(error);
  return data ? unseal(data.cipher_text) : null;
}
export async function signedMedia(ctx: StudioContext, path: string) {
  if (!path.split("/").includes(ctx.workspace))
    throw new StudioError("Invalid media path.", 400);
  const { data, error } = await ctx.db.storage
    .from("content-media")
    .createSignedUrl(path, 3600);
  check(error);
  if (!data) throw new StudioError("Media could not be opened.", 503);
  return data.signedUrl;
}
export const defaultBrands = [
  {
    slug: "dogs",
    name: "Dog channel",
    tone: "Warm, playful, natural. Short captions with personality.",
    audience: "People who love dogs",
    instructions:
      "Describe what the dog actually does. Never invent breed, name, health facts, or a rescue story.",
    color: "#f59e0b",
  },
  {
    slug: "organizing",
    name: "Organizing business",
    tone: "Calm, practical, encouraging. Clear tips without shaming.",
    audience: "People who want a simpler, more organized home",
    instructions:
      "Focus on visible improvements and useful advice. Do not invent client testimonials or claim a space was transformed unless shown.",
    color: "#14b8a6",
  },
  {
    slug: "music",
    name: "Music channel",
    tone: "Confident, concise, authentic to the artist.",
    audience: "Music fans, DJs, and producers",
    instructions:
      "Preserve original audio. Never invent artist names, track titles, release dates, credits, or licensing rights.",
    color: "#a78bfa",
  },
];
export async function ensureBrands(ctx: StudioContext) {
  const { error } = await ctx.db.from("brand_profiles").upsert(
    defaultBrands.map((b) => ({ ...b, workspace_id: ctx.workspace })),
    { onConflict: "workspace_id,slug", ignoreDuplicates: true },
  );
  check(error);
}
