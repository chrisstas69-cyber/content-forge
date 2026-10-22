import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import path from "node:path";
import sharp from "sharp";
import { renderMedia, probe, run } from "../worker/src/media.mjs";
const dir = await mkdtemp(path.join(tmpdir(), "forge-render-test-"));
await run("ffmpeg", [
  "-y",
  "-f",
  "lavfi",
  "-i",
  "testsrc2=size=720x1280:rate=30",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=440:sample_rate=44100",
  "-t",
  "3",
  "-c:v",
  "libx264",
  "-threads",
  "2",
  "-c:a",
  "aac",
  path.join(dir, "portrait.mp4"),
]);
const settings = {
  ratio: "9:16",
  photoMode: "photos",
  trimStart: 1,
  trimEnd: 2.5,
  mute: false,
  perImageSec: 2,
  captionCues: [{ start: 0, end: 1, text: "Real timed subtitles" }],
};
const video = await renderMedia(
  [path.join(dir, "portrait.mp4")],
  "video",
  settings,
  dir,
);
assert.equal(video.media.width, 720);
assert.equal(video.media.height, 1280);
assert.equal(video.media.hasAudio, true);
assert.ok(Math.abs(video.media.durationSec - 1.5) < 0.1);
for (let i = 0; i < 2; i++)
  await sharp({
    create: {
      width: 900,
      height: 600,
      channels: 3,
      background: i ? "#e9b457" : "#48746b",
    },
  })
    .jpeg()
    .toFile(path.join(dir, `photo-${i}.jpg`));
const photos = await renderMedia(
  [0, 1].map((i) => path.join(dir, `photo-${i}.jpg`)),
  "carousel",
  { ...settings, ratio: "1:1", trimStart: 0, trimEnd: null, captionCues: [] },
  dir,
);
assert.equal(photos.kind, "carousel");
assert.equal(photos.files.length, 2);
assert.equal(photos.media.width, 1080);
assert.equal(photos.media.height, 1080);
const slideshow = await renderMedia(
  [0, 1].map((i) => path.join(dir, `photo-${i}.jpg`)),
  "carousel",
  {
    ...settings,
    photoMode: "slideshow",
    trimStart: 0,
    trimEnd: null,
    captionCues: [],
  },
  dir,
);
assert.equal(slideshow.kind, "slideshow");
assert.equal(slideshow.media.width, 720);
assert.equal(slideshow.media.height, 1280);
assert.ok(Math.abs(slideshow.media.durationSec - 4) < 0.1);
await rm(dir, { recursive: true, force: true });
console.log(
  "PASS: portrait trim, original audio, rendered timed subtitles, square photo carousel, vertical slideshow.",
);
