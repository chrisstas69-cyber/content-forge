import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { createBridgeClient } from "./bridge.mjs";
import { probe, renderMedia, run } from "./media.mjs";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const workerId =
  process.env.WORKER_ID || `worker-${Math.random().toString(36).slice(2, 10)}`;
const bridgeUrl = process.env.CONTENT_WORKER_APP_URL,
  bridgeToken = process.env.CONTENT_WORKER_TOKEN;
if (!(bridgeUrl && bridgeToken) && !(url && key))
  throw new Error(
    "Configure the preview worker connection or Supabase worker credentials",
  );
const supabase =
  bridgeUrl && bridgeToken
    ? createBridgeClient(bridgeUrl, bridgeToken, workerId)
    : createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
const pollMs = Math.max(5000, Number(process.env.POLL_INTERVAL_MS || 10000));
let busy = false,
  lastError = null,
  lastCompleted = null,
  activeJob = null;
async function heartbeat() {
  if (supabase.heartbeat) return supabase.heartbeat();
  const { error } = await supabase
    .from("worker_heartbeats")
    .upsert({ worker_id: workerId, seen_at: new Date().toISOString(), busy });
  if (error) throw error;
  if (activeJob)
    await supabase
      .from("processing_jobs")
      .update({ locked_at: new Date().toISOString() })
      .eq("id", activeJob.job_id)
      .eq("locked_by", workerId)
      .eq("status", "running");
}
async function patchItem(id, values) {
  const { error } = await supabase
    .from("content_items")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
async function downloadSources(paths, dir) {
  const local = [];
  for (const [i, name] of paths.entries()) {
    const { data, error } = await supabase.storage
      .from("content-media")
      .download(name);
    if (error) throw error;
    const target = path.join(dir, `source-${i}${path.extname(name) || ".bin"}`);
    await writeFile(target, Buffer.from(await data.arrayBuffer()));
    local.push(target);
  }
  return local;
}
async function upload(local, target, type) {
  const { error } = await supabase.storage
    .from("content-media")
    .upload(target, await readFile(local), { contentType: type, upsert: true });
  if (error) throw error;
}
async function processJob(job) {
  const dir = await mkdtemp(path.join(tmpdir(), "contentforge-"));
  try {
    await patchItem(job.content_item_id, {
      status: "processing",
      progress: 10,
      current_step: "Downloading private media",
      error_message: null,
    });
    const sources = await downloadSources(job.source_paths || [], dir);
    if (!sources.length) throw new Error("No source media found");
    const settings = {
      ratio: "original",
      photoMode: job.kind === "slideshow" ? "slideshow" : "photos",
      trimStart: 0,
      trimEnd: null,
      perImageSec: 4,
      mute: false,
      captionCues: [],
      ...job.edit_settings,
    };
    await patchItem(job.content_item_id, {
      progress: 30,
      current_step: "Rendering your selected format",
    });
    const result = await renderMedia(sources, job.kind, settings, dir);
    const isVideo = ["video", "slideshow"].includes(result.kind);
    const prefix = `${job.user_id}/${job.workspace_id}/${job.content_item_id}/${job.job_id}`;
    const outputPaths = [];
    for (const [i, file] of result.files.entries()) {
      const target = `${prefix}/${isVideo ? "output.mp4" : `image-${i}.jpg`}`;
      await upload(file, target, isVideo ? "video/mp4" : "image/jpeg");
      outputPaths.push(target);
    }
    await patchItem(job.content_item_id, {
      progress: 85,
      current_step: "Preparing previews",
    });
    const frames = [];
    for (let i = 0; i < Math.min(5, isVideo ? 5 : result.files.length); i++) {
      const file = path.join(dir, `frame-${i}.jpg`);
      if (isVideo) {
        const time = Math.max(
          0,
          Math.min(
            (result.media.durationSec * (i + 0.5)) / 5,
            result.media.durationSec - 0.04,
          ),
        );
        await run("ffmpeg", [
          "-y",
          "-ss",
          String(time),
          "-i",
          result.files[0],
          "-frames:v",
          "1",
          "-vf",
          "scale=640:-2",
          "-q:v",
          "3",
          file,
        ]);
      } else
        await sharp(result.files[i])
          .resize(640, 640, { fit: "inside" })
          .jpeg({ quality: 80 })
          .toFile(file);
      const target = `${prefix}/frame-${i}.jpg`;
      await upload(file, target, "image/jpeg");
      frames.push(target);
    }
    const thumbnail = `${prefix}/thumbnail.jpg`;
    await upload(path.join(dir, "frame-0.jpg"), thumbnail, "image/jpeg");
    await patchItem(job.content_item_id, {
      kind: result.kind,
      status: "ready",
      progress: 100,
      current_step: "Ready to review",
      output_path: outputPaths[0],
      thumbnail_path: thumbnail,
      metadata: {
        ...(job.metadata || {}),
        ...result.media,
        outputPaths,
        framePaths: frames,
        renderId: job.job_id,
        renderedSettings: settings,
      },
    });
    const { error } = await supabase
      .from("processing_jobs")
      .update({
        status: "completed",
        locked_at: null,
        locked_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.job_id);
    if (error) throw error;
    lastCompleted = {
      itemId: job.content_item_id,
      at: new Date().toISOString(),
    };
    lastError = null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
async function failJob(job, error) {
  const message = error instanceof Error ? error.message : String(error);
  lastError = { message, at: new Date().toISOString() };
  console.error("Processing failed", job?.job_id || "", message);
  if (!job) return;
  const retry = Number(job.attempts || 1) < 3;
  await patchItem(job.content_item_id, {
    status: retry ? "queued" : "failed",
    progress: 0,
    current_step: retry ? "Retrying processing" : null,
    error_message: message,
  }).catch(() => {});
  await supabase
    .from("processing_jobs")
    .update({
      status: retry ? "queued" : "failed",
      error_message: message,
      locked_at: null,
      locked_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.job_id);
}
async function tick() {
  if (busy) return;
  busy = true;
  try {
    await heartbeat();
    const { data, error } = await supabase.rpc("claim_processing_job", {
      worker_id: workerId,
    });
    if (error) throw error;
    activeJob = data?.[0] || null;
    if (activeJob) await processJob(activeJob);
  } catch (error) {
    await failJob(activeJob, error);
  } finally {
    activeJob = null;
    busy = false;
  }
}
createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  if (req.url === "/health")
    return res.end(
      JSON.stringify({
        ok: !lastError,
        workerId,
        busy,
        lastCompleted,
        lastError,
      }),
    );
  res.statusCode = 404;
  res.end(JSON.stringify({ error: "Not found" }));
}).listen(
  Number(process.env.PORT || 3000),
  process.env.WORKER_HOST || "127.0.0.1",
);
console.log(`Content Forge worker ${workerId} started`);
setInterval(() => heartbeat().catch(() => {}), 30000);
setInterval(tick, pollMs);
tick();
