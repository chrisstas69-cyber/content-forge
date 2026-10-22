import { integration, signedMedia, StudioContext, StudioError } from "./server";
import { validatePost } from "./schema";

const endpoint = "https://zernio.com/api/v1";
export async function publisherRequest(
  key: string,
  path: string,
  init: RequestInit = {},
) {
  const response = await fetch(endpoint + path, {
    ...init,
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok)
    throw new StudioError(
      `Publishing service returned ${response.status}. Check its dashboard before retrying.`,
      502,
    );
  return response.json();
}
export function providerStatus(post: {
  status?: string;
  platforms?: { status?: string }[];
}) {
  if (
    post.platforms?.some((p) => p.status === "published") &&
    post.platforms?.some((p) => p.status === "failed")
  )
    return "partial";
  if (
    ["published", "scheduled", "failed", "partial"].includes(post.status || "")
  )
    return post.status!;
  return "submitting";
}
export async function submitDraft(
  ctx: StudioContext,
  id: string,
  consent: boolean,
  privacy: string,
  aiDisclosure: boolean,
  commercialContent: string = "none",
  allowComments: boolean = false,
) {
  if (!consent)
    throw new StudioError(
      "Confirm that you reviewed the media, own the necessary rights, and approve these destinations.",
    );
  const key = await integration(ctx, "zernio");
  if (!key)
    throw new StudioError(
      "Connect Zernio in Settings first. You can export your media and copy the caption now.",
      409,
    );
  const { data, error } = await ctx.db.rpc("claim_studio_publish", {
    draft_id: id,
    target_workspace: ctx.workspace,
  });
  if (error || !data)
    throw new StudioError(
      error?.message || "Review and approve this draft first.",
      409,
    );
  const draft = data;
  let postRequestStarted = false;
  try {
    const { data: item } = await ctx.db
      .from("content_items")
      .select("*")
      .eq("id", draft.content_item_id)
      .eq("workspace_id", ctx.workspace)
      .single();
    const { data: targets } = await ctx.db
      .from("social_destinations")
      .select("*")
      .eq("workspace_id", ctx.workspace)
      .eq("brand_id", draft.brand_id)
      .in("id", draft.destination_ids);
    if (!item || targets?.length !== draft.destination_ids.length)
      throw new StudioError("A destination changed. Review this draft again.");
    const paths: string[] = item.metadata?.outputPaths || [item.output_path];
    validatePost(draft, targets || [], item.kind, paths.length);
    const isVideo = ["video", "slideshow"].includes(item.kind);
    const tiktokOptions = new Map<string, Record<string, unknown>>();
    for (const target of targets || []) {
      if (target.platform !== "tiktok") continue;
      if (privacy !== "public")
        throw new StudioError(
          "TikTok direct posts in this studio are public. Export to choose another audience in TikTok.",
        );
      if (!isVideo && aiDisclosure)
        throw new StudioError(
          "TikTok requires AI disclosure for photos to be completed in its app. Export these photos instead.",
        );
      const info = await publisherRequest(
        key,
        `/accounts/${encodeURIComponent(target.remote_id)}/tiktok/creator-info?mediaType=${isVideo ? "video" : "photo"}`,
      );
      if (info.creator?.canPostMore === false)
        throw new StudioError(
          "This TikTok account has reached its posting limit. Try later.",
        );
      if (
        !info.privacyLevels?.some(
          (p: { value: string }) => p.value === "PUBLIC_TO_EVERYONE",
        )
      )
        throw new StudioError(
          "Public posting is unavailable for this TikTok account. Export to finish in TikTok.",
        );
      if (
        isVideo &&
        info.postingLimits?.maxVideoDurationSec &&
        item.metadata?.durationSec > info.postingLimits.maxVideoDurationSec
      )
        throw new StudioError(
          "This video exceeds the TikTok account's duration limit. Trim it first.",
        );
      if (
        commercialContent !== "none" &&
        !info.commercialContentTypes?.some(
          (c: { value: string }) => c.value === commercialContent,
        )
      )
        throw new StudioError(
          "This TikTok account does not support the selected promotion disclosure.",
        );
      tiktokOptions.set(target.id, {
        privacy_level: "PUBLIC_TO_EVERYONE",
        allow_comment:
          allowComments &&
          info.postingLimits?.interactionSettings?.allow_comment?.enabled !==
            false,
        allow_duet: false,
        allow_stitch: false,
        commercialContentType: commercialContent,
        content_preview_confirmed: true,
        express_consent_given: true,
        media_type: isVideo ? "video" : "photo",
        auto_add_music: false,
        video_made_with_ai: aiDisclosure,
      });
    }
    const mediaItems: { type: string; url: string }[] = [];
    // Copy media into the publisher's storage before scheduling, so signed URLs cannot expire in its queue.
    for (const path of paths) {
      const type = isVideo ? "video/mp4" : "image/jpeg";
      const presign = await publisherRequest(key, "/media/presign", {
        method: "POST",
        body: JSON.stringify({
          filename: path.split("/").at(-1),
          contentType: type,
        }),
      });
      if (
        !presign.uploadUrl ||
        !presign.publicUrl ||
        !String(presign.uploadUrl).startsWith("https://")
      )
        throw new StudioError("Publisher did not prepare media storage.", 502);
      const download = await fetch(await signedMedia(ctx, path), {
        signal: AbortSignal.timeout(45000),
      });
      if (!download.ok)
        throw new StudioError("Media download failed before publishing.", 502);
      const uploaded = await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: { "content-type": type },
        body: await download.arrayBuffer(),
        signal: AbortSignal.timeout(45000),
      });
      if (!uploaded.ok)
        throw new StudioError("Media transfer failed before publishing.", 502);
      mediaItems.push({
        type: isVideo ? "video" : "image",
        url: presign.publicUrl,
      });
    }
    const payload = {
      content: draft.caption,
      title: draft.title,
      visibility: privacy,
      publishNow: !draft.scheduled_for,
      ...(draft.scheduled_for ? { scheduledFor: draft.scheduled_for } : {}),
      timezone: "UTC",
      mediaItems,
      platforms: (targets || []).map((t) => ({
        platform: t.platform,
        accountId: t.remote_id,
        customContent: draft.variants?.[t.platform] || draft.caption,
        ...(tiktokOptions.has(t.id)
          ? {
              platformSpecificData: { tiktokSettings: tiktokOptions.get(t.id) },
            }
          : {}),
      })),
    };
    postRequestStarted = true;
    const result = await publisherRequest(key, "/posts", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const post = result.post || result;
    const remoteId = post._id || post.id;
    if (!remoteId)
      throw new StudioError(
        "Publisher response was incomplete. Check its dashboard before retrying.",
        502,
      );
    const saved = await ctx.db
      .from("post_drafts")
      .update({
        provider_post_id: remoteId,
        status: providerStatus(post),
        platform_results: post.platforms || [],
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("workspace_id", ctx.workspace);
    if (saved.error)
      throw new StudioError(
        "Post was submitted, but its status could not be saved. Check the publisher dashboard.",
        502,
      );
    return { ok: true, id: remoteId };
  } catch (error) {
    const message =
      error instanceof StudioError
        ? error.message
        : "The publishing connection was interrupted. Check the publisher dashboard.";
    await ctx.db
      .from("post_drafts")
      .update({
        status: postRequestStarted ? "unknown" : "approved",
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("workspace_id", ctx.workspace);
    throw new StudioError(message, 502);
  }
}
