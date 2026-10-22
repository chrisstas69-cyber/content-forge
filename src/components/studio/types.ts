import type { MediaSettings } from "@/lib/studio/schema";
export type Brand = {
  id: string;
  name: string;
  slug: string;
  tone: string;
  audience: string;
  instructions: string;
  color: string;
};
export type Media = {
  id: string;
  brand_id: string | null;
  filename: string;
  kind: string;
  status: string;
  progress: number;
  current_step: string | null;
  error_message: string | null;
  output_path: string | null;
  thumbnail_path: string | null;
  edit_settings: MediaSettings;
  metadata: {
    durationSec?: number;
    width?: number;
    height?: number;
    hasAudio?: boolean;
    outputPaths?: string[];
    transcript?: string;
    renderedSettings?: MediaSettings;
  };
  created_at: string;
};
export type Draft = {
  id: string;
  brand_id: string;
  content_item_id: string;
  title: string;
  caption: string;
  variants: Record<string, string>;
  destination_ids: string[];
  scheduled_for: string | null;
  status: string;
  updated_at: string;
  source: string;
  error_message: string | null;
  provider_post_id: string | null;
  platform_results: {
    platform: string;
    status?: string;
    platformPostUrl?: string;
    error?: string;
  }[];
};
export type Destination = {
  id: string;
  brand_id: string;
  platform: string;
  display_name: string;
  remote_id: string;
};
export type Bootstrap = {
  brands: Brand[];
  items: Media[];
  drafts: Draft[];
  destinations: Destination[];
  integrations: { provider: string }[];
  worker: { online: boolean; busy: boolean; seenAt: string | null };
  owner: boolean;
  testMode: boolean;
  model: string;
};
export async function request<T = { ok: boolean }>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Request failed. Please retry.");
  return data;
}
