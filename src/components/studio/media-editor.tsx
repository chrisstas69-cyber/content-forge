"use client";
import { useState } from "react";
import { mediaSettings, type MediaSettings } from "@/lib/studio/schema";
import { Media, request } from "./types";

export function MediaPreview({ item }: { item: Media }) {
  if (item.status !== "ready")
    return (
      <div className="studio-placeholder">
        <strong>{item.current_step || item.status}</strong>
        <progress value={item.progress} max="100" />
        <p>{item.error_message}</p>
      </div>
    );
  if (["video", "slideshow"].includes(item.kind))
    return (
      <video
        className="studio-preview"
        controls
        playsInline
        preload="metadata"
        poster={`/api/media/${item.id}/thumbnail`}
        src={`/api/media/${item.id}/download?inline=1&v=${encodeURIComponent(item.output_path || "")}`}
      />
    );
  return (
    <div className="studio-photo-preview">
      {(item.metadata.outputPaths || [item.output_path]).map((_, i) => (
        <img
          key={i}
          src={`/api/media/${item.id}/download?inline=1&asset=${i}`}
          alt={`${item.filename}, photo ${i + 1}`}
        />
      ))}
    </div>
  );
}
export function DownloadMedia({ item }: { item: Media }) {
  return (
    <div className="studio-row">
      {(item.metadata.outputPaths || [item.output_path]).map((_, i) => (
        <a
          key={i}
          className="studio-button secondary"
          href={`/api/media/${item.id}/download?asset=${i}`}
        >
          Download{" "}
          {["video", "slideshow"].includes(item.kind)
            ? "video"
            : `photo ${i + 1}`}
        </a>
      ))}
    </div>
  );
}
export function MediaEditor({
  item,
  done,
  run,
}: {
  item: Media;
  done: () => void;
  run: (action: () => Promise<void>) => void;
}) {
  const [settings, setSettings] = useState<MediaSettings>(() =>
    mediaSettings.parse(item.edit_settings || {}),
  );
  const [subtitles, setSubtitles] = useState(() =>
    settings.captionCues
      .map((c) => `${c.start.toFixed(2)} --> ${c.end.toFixed(2)} | ${c.text}`)
      .join("\n"),
  );
  const video = item.kind === "video";
  const update = (value: Partial<MediaSettings>) =>
    setSettings((s) => ({ ...s, ...value }));
  const render = () =>
    run(async () => {
      const cues = subtitles.trim()
        ? subtitles
            .split("\n")
            .filter((l) => l.trim())
            .map((line) => {
              const match = line.match(
                /^([\d.]+)\s*-->\s*([\d.]+)\s*\|\s*(.+)$/,
              );
              if (!match)
                throw new Error("Subtitle format: 0.00 --> 2.50 | Your words");
              return {
                start: Number(match[1]),
                end: Number(match[2]),
                text: match[3],
              };
            })
        : [];
      await request(
        `/api/studio/media/${item.id}/render`,
        mediaSettings.parse({ ...settings, captionCues: cues }),
      );
      done();
    });
  return (
    <section className="studio-panel studio-editor">
      <div className="studio-section-heading">
        <h2>{item.filename}</h2>
        <button className="studio-button secondary" onClick={done}>
          Close editor
        </button>
      </div>
      <MediaPreview item={item} />
      {item.status === "ready" && <DownloadMedia item={item} />}
      <div className="studio-form-grid">
        <label>
          Output shape
          <select
            value={settings.ratio}
            onChange={(e) =>
              update({ ratio: e.target.value as MediaSettings["ratio"] })
            }
          >
            <option value="original">Original shape</option>
            <option value="9:16">Vertical · 9:16</option>
            <option value="1:1">Square · 1:1</option>
            <option value="16:9">Landscape · 16:9</option>
          </select>
        </label>
        {!video && (
          <label>
            Photo output
            <select
              value={settings.photoMode}
              onChange={(e) =>
                update({
                  photoMode: e.target.value as MediaSettings["photoMode"],
                })
              }
            >
              <option value="photos">Photos / carousel</option>
              <option value="slideshow">Slideshow video</option>
            </select>
          </label>
        )}
        {!video && settings.photoMode === "slideshow" && (
          <label>
            Seconds per photo
            <input
              type="number"
              min="2"
              max="15"
              value={settings.perImageSec}
              onChange={(e) => update({ perImageSec: Number(e.target.value) })}
            />
          </label>
        )}
        {video && (
          <>
            <label>
              Clip start (seconds)
              <input
                type="number"
                min="0"
                step="0.1"
                value={settings.trimStart}
                onChange={(e) => update({ trimStart: Number(e.target.value) })}
              />
            </label>
            <label>
              Clip end (seconds, optional)
              <input
                type="number"
                min="0"
                step="0.1"
                value={settings.trimEnd ?? ""}
                onChange={(e) =>
                  update({
                    trimEnd: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </label>
            <label className="studio-check">
              <input
                type="checkbox"
                checked={settings.mute}
                onChange={(e) => update({ mute: e.target.checked })}
              />
              Mute original audio
            </label>
          </>
        )}
      </div>
      {(video || settings.photoMode === "slideshow") && (
        <>
          <div className="studio-section-heading">
            <h3>Subtitles</h3>
            <button
              disabled={item.status !== "ready"}
              className="studio-button secondary"
              onClick={() =>
                run(async () => {
                  const result = await request<{
                    cues: MediaSettings["captionCues"];
                  }>(`/api/studio/media/${item.id}/transcribe`, {});
                  setSubtitles(
                    result.cues
                      .map(
                        (c) =>
                          `${c.start.toFixed(2)} --> ${c.end.toFixed(2)} | ${c.text}`,
                      )
                      .join("\n"),
                  );
                })
              }
            >
              Transcribe speech
            </button>
          </div>
          <p className="studio-muted">
            Speech transcription uses Deepgram when connected. Review the words
            and timing, then render to add them to the video. Music stays
            untouched unless you mute it.
          </p>
          <label>
            Timed subtitles
            <textarea
              rows={5}
              value={subtitles}
              placeholder="0.00 --> 2.50 | Your words here"
              onChange={(e) => setSubtitles(e.target.value)}
            />
          </label>
        </>
      )}
      <p className="studio-muted">
        The full image stays visible; padding fills other shapes. Originals are
        kept. Rendering resets approval on editable drafts.
      </p>
      <button
        className="studio-button"
        disabled={!["ready", "failed"].includes(item.status)}
        onClick={render}
      >
        {item.status === "failed" ? "Retry processing" : "Render changes"}
      </button>
    </section>
  );
}
