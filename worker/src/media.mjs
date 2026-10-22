import { spawn } from "node:child_process";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "",
      stdout = "";
    child.stderr.on("data", (d) => {
      stderr = (stderr + d).slice(-20000);
    });
    child.stdout.on("data", (d) => {
      stdout = (stdout + d).slice(-2000000);
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(stdout)
        : reject(new Error(`${command} failed: ${stderr.slice(-1800)}`)),
    );
  });
}
export async function probe(file) {
  const json = JSON.parse(
    await run("ffprobe", [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      file,
    ]),
  );
  const video = json.streams?.find((s) => s.codec_type === "video");
  return {
    durationSec: Number(json.format?.duration || 0),
    width: Number(video?.width || 0),
    height: Number(video?.height || 0),
    hasAudio: Boolean(json.streams?.some((s) => s.codec_type === "audio")),
  };
}
export async function joinParts(files, dir) {
  if (files.length === 1) return files[0];
  const target = path.join(dir, `combined${path.extname(files[0])}`);
  await writeFile(target, new Uint8Array());
  for (const file of files) await appendFile(target, await readFile(file));
  return target;
}
export function dimensions(ratio, width = 1280, height = 720) {
  if (ratio === "9:16") return [720, 1280];
  if (ratio === "1:1") return [1080, 1080];
  if (ratio === "16:9") return [1280, 720];
  const scale = Math.min(1, 1280 / Math.max(width, height));
  return [
    Math.max(2, Math.floor((width * scale) / 2) * 2),
    Math.max(2, Math.floor((height * scale) / 2) * 2),
  ];
}
function xml(text) {
  return text.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
}
function concatPath(file) {
  return `file '${file.replaceAll("'", "'\\''")}'`;
}
async function captionTrack(cues, width, dir, duration) {
  const height = Math.round((width * 0.27) / 2) * 2,
    font = Math.round(width * 0.043),
    blank = path.join(dir, "caption-blank.png");
  await sharp({
    create: { width, height, channels: 4, background: "#00000000" },
  })
    .png()
    .toFile(blank);
  const list = [];
  let cursor = 0;
  for (const [index, cue] of cues.entries()) {
    if (cue.start >= duration) continue;
    if (cue.start < cursor - 0.001 || cue.end <= cue.start)
      throw new Error("Subtitle cues must be ordered and must not overlap.");
    if (cue.start > cursor)
      list.push(concatPath(blank), `duration ${cue.start - cursor}`);
    const words = cue.text.split(/\s+/),
      lines = [""];
    for (const word of words) {
      if ((lines.at(-1) + word).length > 33) lines.push("");
      lines[lines.length - 1] += word + " ";
    }
    if (lines.length > 3)
      throw new Error("A subtitle is too long. Split it into shorter lines.");
    const boxHeight = Math.min(height - 8, lines.length * font * 1.25 + 20),
      file = path.join(dir, `caption-${index}.png`);
    const svg = `<svg width="${width}" height="${height}"><rect x="${width * 0.06}" y="4" width="${width * 0.88}" height="${boxHeight}" rx="12" fill="black" fill-opacity=".7"/>${lines.map((line, i) => `<text x="50%" y="${font + 10 + i * font * 1.25}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${font}" font-weight="bold" fill="white">${xml(line.trim())}</text>`).join("")}</svg>`;
    await sharp(Buffer.from(svg)).png().toFile(file);
    const end = Math.min(duration, cue.end);
    list.push(concatPath(file), `duration ${end - cue.start}`);
    cursor = end;
  }
  if (cursor < duration)
    list.push(concatPath(blank), `duration ${duration - cursor}`);
  list.push(concatPath(blank));
  const file = path.join(dir, "captions.txt");
  await writeFile(file, list.join("\n"));
  return { file, height };
}
export async function normalizePhotos(files, settings, dir) {
  const result = [];
  for (const [i, input] of files.entries()) {
    const file = path.join(dir, `image-${i}.jpg`);
    let image = sharp(input).rotate();
    if (settings.ratio !== "original") {
      const [width, height] = dimensions(settings.ratio);
      image = image.resize(width, height, {
        fit: "contain",
        background: "#101014",
      });
    } else
      image = image.resize(2048, 2048, {
        fit: "inside",
        withoutEnlargement: true,
      });
    try {
      await image.jpeg({ quality: 90 }).toFile(file);
    } catch {
      throw new Error(
        "This photo format could not be read. Export it as JPEG or PNG and upload again.",
      );
    }
    result.push(file);
  }
  return result;
}
export async function renderMedia(files, kind, settings, dir) {
  const photos =
    kind !== "video" ? await normalizePhotos(files, settings, dir) : null;
  if (photos && settings.photoMode !== "slideshow") {
    const meta = await sharp(photos[0]).metadata();
    return {
      files: photos,
      kind: photos.length > 1 ? "carousel" : "image",
      media: {
        width: meta.width,
        height: meta.height,
        durationSec: 0,
        hasAudio: false,
      },
    };
  }
  let input, media, args;
  if (photos) {
    const list = photos.flatMap((file) => [
      concatPath(file),
      `duration ${settings.perImageSec}`,
    ]);
    list.push(concatPath(photos.at(-1)));
    input = path.join(dir, "images.txt");
    await writeFile(input, list.join("\n"));
    media = {
      durationSec: photos.length * settings.perImageSec,
      width: 720,
      height: 1280,
      hasAudio: false,
    };
    args = ["-f", "concat", "-safe", "0", "-i", input];
  } else {
    input = await joinParts(files, dir);
    media = await probe(input);
    if (!media.width || !media.durationSec)
      throw new Error("This file does not contain a readable video.");
    if (settings.trimStart >= media.durationSec)
      throw new Error("Clip start is beyond the end of the video.");
    const start = settings.trimStart || 0,
      end = Math.min(settings.trimEnd ?? media.durationSec, media.durationSec);
    media.durationSec = end - start;
    args = [...(start ? ["-ss", String(start)] : []), "-i", input];
  }
  if (media.durationSec <= 0) throw new Error("The selected clip is empty.");
  const [width, height] = dimensions(
    settings.ratio === "original" && photos ? "9:16" : settings.ratio,
    media.width,
    media.height,
  );
  const scale = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30`;
  const cues = settings.captionCues || [];
  if (cues.length) {
    const track = await captionTrack(cues, width, dir, media.durationSec);
    args.push(
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      track.file,
      "-filter_complex",
      `[0:v]${scale}[base];[base][1:v]overlay=0:H-h-${Math.round(height * 0.12)}:eof_action=pass,format=yuv420p[v]`,
      "-map",
      "[v]",
    );
  } else args.push("-vf", `${scale},format=yuv420p`, "-map", "0:v:0");
  if (!settings.mute) args.push("-map", "0:a?");
  // A bounded bitrate keeps the output within Supabase Free's 50 MB object limit.
  const bitrate = Math.min(
    4500000,
    Math.floor((43 * 1024 * 1024 * 8) / media.durationSec) - 160000,
  );
  if (bitrate < 250000)
    throw new Error(
      "This clip is too long for the current storage plan. Select a shorter clip (under 12 minutes) and render again.",
    );
  const output = path.join(dir, "output.mp4");
  await run("ffmpeg", [
    "-y",
    "-filter_threads",
    "2",
    "-filter_complex_threads",
    "2",
    "-threads",
    "2",
    ...args,
    "-t",
    String(media.durationSec),
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-b:v",
    String(bitrate),
    "-maxrate",
    String(bitrate),
    "-bufsize",
    String(bitrate * 2),
    "-threads",
    "2",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    output,
  ]);
  const outputBytes = await readFile(output);
  if (outputBytes.length > 48 * 1024 * 1024)
    throw new Error(
      "The rendered video exceeds the storage limit. Select a shorter clip and retry.",
    );
  return {
    files: [output],
    kind: photos ? "slideshow" : "video",
    media: await probe(output),
  };
}
