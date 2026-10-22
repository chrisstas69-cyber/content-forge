import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  studioContext,
  scopedItem,
  check,
  ensureBrands,
  integration,
  seal,
  signedMedia,
  StudioError,
} from "@/lib/studio/server";
import {
  draftInput,
  mediaSettings,
  platforms,
  platformSchema,
} from "@/lib/studio/schema";
import {
  providerStatus,
  publisherRequest,
  submitDraft,
} from "@/lib/studio/publisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const uuid = z.string().uuid();
const now = () => new Date().toISOString();
type RouteContext = { params: Promise<{ path: string[] }> };
const provider = z.enum(["openrouter", "deepgram", "zernio"]);

async function handle(req: NextRequest, route: RouteContext) {
  const ctx = await studioContext();
  const { path } = await route.params;
  const [resource, id, action] = path;
  if (req.method === "GET" && resource === "bootstrap") {
    await ensureBrands(ctx);
    const results = await Promise.all([
      ctx.db
        .from("brand_profiles")
        .select("*")
        .eq("workspace_id", ctx.workspace)
        .order("created_at"),
      ctx.db
        .from("content_items")
        .select("*")
        .eq("workspace_id", ctx.workspace)
        .order("created_at", { ascending: false })
        .limit(100),
      ctx.db
        .from("post_drafts")
        .select("*")
        .eq("workspace_id", ctx.workspace)
        .order("created_at", { ascending: false })
        .limit(100),
      ctx.db
        .from("social_destinations")
        .select("*")
        .eq("workspace_id", ctx.workspace),
      ctx.db
        .from("studio_integrations")
        .select("provider,updated_at")
        .eq("workspace_id", ctx.workspace),
      ctx.db
        .from("worker_heartbeats")
        .select("seen_at,busy")
        .order("seen_at", { ascending: false })
        .limit(1),
    ]);
    results.forEach((r) => check(r.error));
    const heartbeat = results[5].data?.[0];
    return NextResponse.json(
      {
        brands: results[0].data,
        items: results[1].data,
        drafts: results[2].data,
        destinations: results[3].data,
        integrations: results[4].data,
        worker: {
          online: Boolean(
            heartbeat && Date.now() - Date.parse(heartbeat.seen_at) < 90000,
          ),
          busy: heartbeat?.busy || false,
          seenAt: heartbeat?.seen_at || null,
        },
        owner: ctx.owner,
        testMode: process.env.TEST_MODE_ENABLED === "true",
        model: "openai/gpt-6-luna",
      },
      { headers: { "cache-control": "no-store" } },
    );
  }
  if (req.method === "GET" && resource === "publisher-accounts") {
    if (!ctx.owner)
      throw new StudioError(
        "Only a workspace owner can connect accounts.",
        403,
      );
    const key = await integration(ctx, "zernio");
    if (!key)
      throw new StudioError("Save a Zernio API key in Settings first.", 409);
    const result = await publisherRequest(key, "/accounts");
    return NextResponse.json({
      accounts: (result.accounts || [])
        .filter(
          (a: { platform: string; isActive?: boolean }) =>
            platforms.includes(a.platform as (typeof platforms)[number]) &&
            a.isActive !== false,
        )
        .map(
          (a: {
            _id: string;
            platform: string;
            username?: string;
            displayName?: string;
            profileId?: string | { _id: string };
          }) => ({
            remote_id: a._id,
            platform: a.platform,
            display_name: a.displayName || a.username || a.platform,
            profile_id:
              typeof a.profileId === "string" ? a.profileId : a.profileId?._id,
          }),
        ),
    });
  }
  if (
    req.method === "GET" &&
    resource === "drafts" &&
    id &&
    action === "export"
  ) {
    const draft = await scopedItem(ctx, "post_drafts", uuid.parse(id));
    const brand = await scopedItem(ctx, "brand_profiles", draft.brand_id);
    const text = `${brand.name}\n${draft.title}\n\n${draft.caption}\n\n${platforms.map((p) => `${p.toUpperCase()}\n${draft.variants?.[p] || draft.caption}`).join("\n\n")}`;
    return new NextResponse(text, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": `attachment; filename="content-forge-${draft.id}.txt"`,
        "cache-control": "no-store",
      },
    });
  }
  const body = await req.json().catch(() => null);
  if (req.method === "PATCH" && resource === "brands" && id) {
    const input = z
      .object({
        name: z.string().trim().min(1).max(80),
        tone: z.string().max(1000),
        audience: z.string().max(1000),
        instructions: z.string().max(3000),
      })
      .parse(body);
    await scopedItem(ctx, "brand_profiles", uuid.parse(id));
    const { error } = await ctx.db
      .from("brand_profiles")
      .update(input)
      .eq("id", id)
      .eq("workspace_id", ctx.workspace);
    check(error);
    return NextResponse.json({ ok: true });
  }
  if (req.method === "POST" && resource === "integrations") {
    if (!ctx.owner)
      throw new StudioError(
        "Only a workspace owner can change integrations.",
        403,
      );
    const input = z
      .object({ provider, key: z.string().trim().min(10).max(1000) })
      .parse(body);
    if (input.provider === "zernio")
      await publisherRequest(input.key, "/accounts");
    if (input.provider === "openrouter") {
      const response = await fetch("https://openrouter.ai/api/v1/key", {
        headers: { authorization: `Bearer ${input.key}` },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new StudioError(
          "OpenRouter did not accept this key. Check it and try again.",
          400,
        );
    }
    const { error } = await ctx.db.from("studio_integrations").upsert({
      workspace_id: ctx.workspace,
      provider: input.provider,
      cipher_text: seal(input.key),
      updated_at: now(),
    });
    check(error);
    return NextResponse.json({ ok: true });
  }
  if (req.method === "POST" && resource === "import-saved-ai") {
    if (
      !ctx.owner ||
      process.env.TEST_MODE_ENABLED !== "true" ||
      ctx.user.email !== process.env.TEST_MODE_USER_EMAIL
    )
      throw new StudioError(
        "Saved key import is available only to the original testing account.",
        403,
      );
    const { getSecret } = await import("@/lib/secrets");
    const key = await getSecret("openrouter.api_key");
    if (!key)
      throw new StudioError(
        "No previous OpenRouter key was found. Add one in Settings.",
        404,
      );
    const response = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new StudioError(
        "The saved AI key no longer works. Add a new one in Settings.",
        409,
      );
    const { error } = await ctx.db.from("studio_integrations").upsert({
      workspace_id: ctx.workspace,
      provider: "openrouter",
      cipher_text: seal(key),
      updated_at: now(),
    });
    check(error);
    return NextResponse.json({ ok: true });
  }
  if (req.method === "POST" && resource === "destinations") {
    if (!ctx.owner)
      throw new StudioError(
        "Only a workspace owner can assign social accounts.",
        403,
      );
    const input = z
      .object({ brand_id: uuid, remote_id: z.string().min(1).max(200) })
      .parse(body);
    await scopedItem(ctx, "brand_profiles", input.brand_id);
    const key = await integration(ctx, "zernio");
    if (!key) throw new StudioError("Connect Zernio first.", 409);
    const result = await publisherRequest(key, "/accounts");
    const account = result.accounts?.find(
      (a: { _id: string }) => a._id === input.remote_id,
    );
    if (
      !account ||
      account.isActive === false ||
      !platforms.includes(account.platform)
    )
      throw new StudioError(
        "Account is no longer connected to your publisher.",
      );
    const { error } = await ctx.db.from("social_destinations").upsert(
      {
        ...input,
        workspace_id: ctx.workspace,
        platform: platformSchema.parse(account.platform),
        display_name:
          account.displayName || account.username || account.platform,
        profile_id:
          typeof account.profileId === "string"
            ? account.profileId
            : account.profileId?._id,
      },
      { onConflict: "workspace_id,remote_id" },
    );
    check(error);
    return NextResponse.json({ ok: true });
  }
  if (
    req.method === "POST" &&
    resource === "media" &&
    id &&
    action === "render"
  ) {
    const item = await scopedItem(ctx, "content_items", uuid.parse(id));
    const settings = mediaSettings.parse(body);
    if (item.kind === "video" && settings.photoMode === "slideshow")
      throw new StudioError("This item is already a video.");
    const changedTrim =
      settings.trimStart !== (item.edit_settings?.trimStart || 0) ||
      settings.trimEnd !== (item.edit_settings?.trimEnd ?? null);
    if (changedTrim && settings.captionCues.length)
      throw new StudioError(
        "Clear the subtitles before changing the clip range, then transcribe the new clip.",
      );
    const { error } = await ctx.db.rpc("requeue_studio_media", {
      item_id: id,
      target_workspace: ctx.workspace,
      new_settings: settings,
    });
    if (error)
      throw new StudioError(
        "Wait for processing to finish, then try rendering again.",
        409,
      );
    return NextResponse.json({ ok: true });
  }
  if (
    req.method === "POST" &&
    resource === "media" &&
    id &&
    action === "transcribe"
  ) {
    const item = await scopedItem(ctx, "content_items", uuid.parse(id));
    if (item.status !== "ready" || !["video", "slideshow"].includes(item.kind))
      throw new StudioError("Process a video first.");
    const key = await integration(ctx, "deepgram");
    if (!key)
      throw new StudioError(
        "Add a Deepgram key in Settings to transcribe speech. You can also enter timed subtitles manually.",
        409,
      );
    const { error: budgetError } = await ctx.db.rpc("reserve_studio_usage", {
      target_workspace: ctx.workspace,
      actor: ctx.user.id,
      event_kind: "studio_transcribe",
      amount: Math.max(1, Math.ceil((item.metadata?.durationSec || 60) / 60)),
    });
    if (budgetError)
      throw new StudioError(
        "Today’s speech budget is used (20 minutes per workspace). Try tomorrow or enter subtitles manually.",
        429,
      );
    const response = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&detect_language=true&punctuate=true",
      {
        method: "POST",
        headers: {
          authorization: `Token ${key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ url: await signedMedia(ctx, item.output_path) }),
        signal: AbortSignal.timeout(180000),
      },
    );
    if (!response.ok)
      throw new StudioError(
        `Speech service returned ${response.status}. Check the key and available credit.`,
        502,
      );
    const result = await response.json(),
      alternative = result.results?.channels?.[0]?.alternatives?.[0];
    const words: {
      start: number;
      end: number;
      word: string;
      punctuated_word?: string;
    }[] = alternative?.words || [];
    if (!words.length)
      throw new StudioError(
        "No speech was detected. Original audio is preserved; no subtitles were invented.",
        422,
      );
    const cues: { start: number; end: number; text: string }[] = [];
    for (let i = 0; i < words.length; i += 6) {
      const group = words.slice(i, i + 6);
      cues.push({
        start: group[0].start,
        end: group.at(-1)!.end,
        text: group.map((w) => w.punctuated_word || w.word).join(" "),
      });
    }
    const validated = mediaSettings.parse({
      ...item.edit_settings,
      captionCues: cues,
    });
    const { error } = await ctx.db
      .from("content_items")
      .update({
        edit_settings: validated,
        metadata: { ...item.metadata, transcript: alternative.transcript },
        updated_at: now(),
      })
      .eq("id", id)
      .eq("workspace_id", ctx.workspace)
      .eq("status", "ready")
      .eq("output_path", item.output_path);
    check(error);
    return NextResponse.json({ cues, transcript: alternative.transcript });
  }
  if (req.method === "POST" && resource === "drafts" && !id) {
    const input = z
      .object({
        content_item_id: uuid,
        brand_id: uuid,
        generate: z.boolean().default(false),
        brief: z.string().max(2000).default(""),
      })
      .parse(body);
    const item = await scopedItem(ctx, "content_items", input.content_item_id),
      brand = await scopedItem(ctx, "brand_profiles", input.brand_id);
    if (item.status !== "ready")
      throw new StudioError("Wait for the media to finish processing.", 409);
    if (item.brand_id && item.brand_id !== brand.id)
      throw new StudioError("Choose the brand that owns this media.");
    if (!item.brand_id) {
      const { error } = await ctx.db
        .from("content_items")
        .update({ brand_id: brand.id })
        .eq("id", item.id)
        .is("brand_id", null);
      check(error);
    }
    let content = {
        title: item.filename.replace(/\.[a-z0-9]+$/i, "").slice(0, 100),
        caption: "",
        variants: {},
      },
      source = "manual";
    if (input.generate) {
      const key = await integration(ctx, "openrouter");
      if (!key)
        throw new StudioError(
          "Connect AI in Settings, or choose Write my own draft.",
          409,
        );
      const frames: string[] = (
        item.metadata?.framePaths ||
        (item.thumbnail_path ? [item.thumbnail_path] : [])
      ).slice(0, 5);
      if (!frames.length)
        throw new StudioError(
          "Visual previews are missing. Render this media again first.",
          409,
        );
      const images = await Promise.all(
        frames.map(async (frame) => ({
          type: "image_url",
          image_url: { url: await signedMedia(ctx, frame) },
        })),
      );
      const prompt = `Create accurate social post drafts for ${brand.name}. Tone: ${brand.tone}. Audience: ${brand.audience}. Instructions: ${brand.instructions}. User brief: ${input.brief}. Media type: ${item.kind}; duration: ${item.metadata?.durationSec || "still images"}; transcript: ${String(item.metadata?.transcript || "No transcript available. Do not invent spoken words.").slice(0, 12000)}. Images are sampled frames in time order, not a complete video. Do not invent actions, names, before/after results, music titles, rights, or performance claims. Do not mention a visual detail unless supported. Return JSON only with title (max100 characters), caption (max1500), and variants object with instagram, tiktok, youtube, facebook captions, each max2000. Keep hashtags relevant, at most5. No viral score.`;
      const { error: budgetError } = await ctx.db.rpc("reserve_studio_usage", {
        target_workspace: ctx.workspace,
        actor: ctx.user.id,
        event_kind: "studio_ai_draft",
        amount: 1,
      });
      if (budgetError)
        throw new StudioError(
          "Today’s AI draft budget is used (20 requests per workspace). Manual drafting and exports still work.",
          429,
        );
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
            "HTTP-Referer": new URL(req.url).origin,
            "X-Title": "Content Forge",
          },
          body: JSON.stringify({
            model: "openai/gpt-6-luna",
            messages: [
              {
                role: "user",
                content: [{ type: "text", text: prompt }, ...images],
              },
            ],
            response_format: { type: "json_object" },
            max_tokens: 1800,
          }),
          signal: AbortSignal.timeout(90000),
        },
      );
      if (!response.ok)
        throw new StudioError(
          `AI service returned ${response.status}. You can write your own draft while its key or credit is checked.`,
          502,
        );
      const result = await response.json();
      let parsed;
      try {
        parsed = JSON.parse(
          (result.choices?.[0]?.message?.content || "").replace(
            /^```(?:json)?\s*|\s*```$/g,
            "",
          ),
        );
      } catch {
        throw new StudioError(
          "AI returned an unreadable draft. Retry or write your own.",
          502,
        );
      }
      const validated = draftInput.safeParse(parsed);
      if (!validated.success)
        throw new StudioError(
          "AI returned an incomplete draft. Retry or write your own.",
          502,
        );
      content = validated.data;
      source = "openrouter:openai/gpt-6-luna";
    }
    const { data, error } = await ctx.db
      .from("post_drafts")
      .insert({
        workspace_id: ctx.workspace,
        brand_id: brand.id,
        content_item_id: item.id,
        ...content,
        source,
      })
      .select("*")
      .single();
    check(error);
    return NextResponse.json({ draft: data });
  }
  if (resource === "drafts" && id) {
    const draft = await scopedItem(ctx, "post_drafts", uuid.parse(id));
    if (req.method === "PATCH") {
      if (!["draft", "approved", "failed"].includes(draft.status))
        throw new StudioError(
          "This post has already been submitted. Check the publisher dashboard to change or cancel it.",
          409,
        );
      const input = draftInput.extend({ updated_at: z.string() }).parse(body);
      const { updated_at, ...values } = input;
      if (values.destination_ids.length) {
        const { data } = await ctx.db
          .from("social_destinations")
          .select("id")
          .eq("workspace_id", ctx.workspace)
          .eq("brand_id", draft.brand_id)
          .in("id", values.destination_ids);
        if (data?.length !== new Set(values.destination_ids).size)
          throw new StudioError("Choose accounts assigned to this brand.");
      }
      const { data, error } = await ctx.db
        .from("post_drafts")
        .update({
          ...values,
          status: "draft",
          media_version: null,
          updated_at: now(),
        })
        .eq("id", id)
        .eq("workspace_id", ctx.workspace)
        .eq("updated_at", updated_at)
        .select("id")
        .maybeSingle();
      check(error);
      if (!data)
        throw new StudioError(
          "This draft changed elsewhere. Reload it before saving.",
          409,
        );
      return NextResponse.json({ ok: true });
    }
    if (req.method === "POST" && action === "approve") {
      if (!["draft", "approved", "failed"].includes(draft.status))
        throw new StudioError("This post is already submitted.", 409);
      const item = await scopedItem(
        ctx,
        "content_items",
        draft.content_item_id,
      );
      if (item.status !== "ready")
        throw new StudioError("Wait for media processing to finish.", 409);
      if (!draft.caption.trim())
        throw new StudioError("Write a caption before approving.");
      const { data: approved, error } = await ctx.db
        .from("post_drafts")
        .update({
          status: "approved",
          media_version: item.output_path,
          error_message: null,
          updated_at: now(),
        })
        .eq("id", id)
        .eq("workspace_id", ctx.workspace)
        .eq("updated_at", draft.updated_at)
        .select("id")
        .maybeSingle();
      check(error);
      if (!approved)
        throw new StudioError(
          "This draft changed. Reload before approving.",
          409,
        );
      return NextResponse.json({ ok: true });
    }
    if (req.method === "POST" && action === "publish") {
      if (process.env.TEST_MODE_ENABLED === "true")
        throw new StudioError(
          "Live posting is disabled on the password-free testing preview. Export posts now; connect a private signed-in workspace before live publishing.",
          409,
        );
      const input = z
        .object({
          consent: z.literal(true),
          visibility: z
            .enum(["public", "unlisted", "private"])
            .default("public"),
          aiDisclosure: z.boolean().default(false),
          commercialContent: z
            .enum(["none", "brand_organic", "brand_content"])
            .default("none"),
          allowComments: z.boolean().default(false),
        })
        .parse(body);
      return NextResponse.json(
        await submitDraft(
          ctx,
          id,
          input.consent,
          input.visibility,
          input.aiDisclosure,
          input.commercialContent,
          input.allowComments,
        ),
      );
    }
    if (req.method === "POST" && action === "refresh") {
      if (!draft.provider_post_id)
        throw new StudioError(
          "No provider post ID is available. Check the publisher dashboard; this app will not risk submitting a duplicate.",
          409,
        );
      const key = await integration(ctx, "zernio");
      if (!key) throw new StudioError("Connect Zernio first.", 409);
      const result = await publisherRequest(
          key,
          `/posts/${encodeURIComponent(draft.provider_post_id)}`,
        ),
        post = result.post || result;
      const { error } = await ctx.db
        .from("post_drafts")
        .update({
          status: providerStatus(post),
          platform_results: post.platforms || [],
          error_message: post.error || null,
          updated_at: now(),
        })
        .eq("id", id)
        .eq("workspace_id", ctx.workspace);
      check(error);
      return NextResponse.json({ ok: true });
    }
  }
  throw new StudioError("Studio action not found.", 404);
}
async function route(req: NextRequest, ctx: RouteContext) {
  try {
    return await handle(req, ctx);
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues[0]?.message || "Invalid input." },
        { status: 400 },
      );
    if (error instanceof StudioError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    console.error(
      "Studio request failed",
      error instanceof Error ? error.name : "Unknown error",
    );
    return NextResponse.json(
      {
        error:
          "The connection was interrupted. Your saved media and drafts are safe. Please retry.",
      },
      { status: 503 },
    );
  }
}
export const GET = route;
export const POST = route;
export const PATCH = route;
