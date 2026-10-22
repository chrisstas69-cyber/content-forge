"use client";
import { useState } from "react";
import { platforms } from "@/lib/studio/schema";
import { Destination, Draft, Media, request } from "./types";
import { DownloadMedia, MediaPreview } from "./media-editor";

export function DraftEditor({
  draft,
  item,
  destinations,
  run,
  connected,
  testMode,
}: {
  draft: Draft;
  item: Media;
  destinations: Destination[];
  run: (action: () => Promise<void>) => void;
  connected: boolean;
  testMode: boolean;
}) {
  const [title, setTitle] = useState(draft.title),
    [caption, setCaption] = useState(draft.caption);
  const [variants, setVariants] = useState(draft.variants),
    [selected, setSelected] = useState(draft.destination_ids);
  const [schedule, setSchedule] = useState(() =>
    draft.scheduled_for
      ? new Date(
          Date.parse(draft.scheduled_for) -
            new Date().getTimezoneOffset() * 60000,
        )
          .toISOString()
          .slice(0, 16)
      : "",
  );
  const [platform, setPlatform] = useState("instagram"),
    [consent, setConsent] = useState(false),
    [aiDisclosure, setAiDisclosure] = useState(false);
  const [visibility, setVisibility] = useState("");
  const [commercialContent, setCommercialContent] = useState("none"),
    [allowComments, setAllowComments] = useState(false);
  const editable = ["draft", "approved", "failed"].includes(draft.status);
  const payload = {
    title,
    caption,
    variants,
    destination_ids: selected,
    scheduled_for: schedule ? new Date(schedule).toISOString() : null,
  };
  const dirty =
    JSON.stringify(payload) !==
    JSON.stringify({
      title: draft.title,
      caption: draft.caption,
      variants: draft.variants,
      destination_ids: draft.destination_ids,
      scheduled_for: draft.scheduled_for,
    });
  return (
    <section className="studio-panel studio-editor">
      <div className="studio-section-heading">
        <h2>Review your post</h2>
        <span className={`studio-badge ${draft.status}`}>{draft.status}</span>
      </div>
      <MediaPreview item={item} />
      <DownloadMedia item={item} />
      {draft.error_message && (
        <p className="studio-alert" role="alert">
          {draft.error_message}
        </p>
      )}
      <fieldset disabled={!editable} className="studio-fields">
        <label>
          Post title / YouTube title
          <input
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Base caption
          <textarea
            rows={5}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
        </label>
        <div
          className="studio-platforms"
          role="group"
          aria-label="Platform caption"
        >
          <span>Platform versions</span>
          {platforms.map((p) => (
            <button
              key={p}
              className={`studio-chip ${platform === p ? "selected" : ""}`}
              onClick={() => setPlatform(p)}
            >
              {p}
            </button>
          ))}
        </div>
        <label>
          {platform} caption{" "}
          <span className="studio-muted">· blank uses the base caption</span>
          <textarea
            rows={5}
            value={variants[platform] || ""}
            onChange={(e) =>
              setVariants({ ...variants, [platform]: e.target.value })
            }
          />
          <small>{(variants[platform] || caption).length} characters</small>
        </label>
        <h3>Choose exact destinations</h3>
        {!destinations.length && (
          <p className="studio-muted">
            No accounts connected to this brand yet. You can still export the
            media and captions.
          </p>
        )}
        {destinations.map((a) => (
          <label className="studio-check" key={a.id}>
            <input
              type="checkbox"
              checked={selected.includes(a.id)}
              onChange={(e) =>
                setSelected((s) =>
                  e.target.checked
                    ? [...s, a.id]
                    : s.filter((id) => id !== a.id),
                )
              }
            />
            <strong>{a.platform}</strong> · {a.display_name}
          </label>
        ))}
        <label>
          Schedule (your local time, optional)
          <input
            type="datetime-local"
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
          />
        </label>
        <p className="studio-muted">
          Leave the schedule blank to post when you click Publish. Scheduled
          posts run through the publishing service even while this Mac is
          asleep.
        </p>
      </fieldset>
      <div className="studio-row">
        {editable && (
          <button
            className="studio-button secondary"
            disabled={!dirty}
            onClick={() =>
              run(async () => {
                await request(
                  `/api/studio/drafts/${draft.id}`,
                  { ...payload, updated_at: draft.updated_at },
                  "PATCH",
                );
              })
            }
          >
            Save changes
          </button>
        )}
        {editable && (
          <button
            className="studio-button"
            disabled={dirty || !caption.trim() || item.status !== "ready"}
            onClick={() =>
              run(async () => {
                await request(`/api/studio/drafts/${draft.id}/approve`, {});
              })
            }
          >
            Approve this draft
          </button>
        )}
        <button
          className="studio-button secondary"
          onClick={() =>
            run(async () => {
              await navigator.clipboard.writeText(
                variants[platform] || caption,
              );
            })
          }
        >
          Copy {platform} caption
        </button>
        <a
          className="studio-button secondary"
          href={`/api/studio/drafts/${draft.id}/export`}
        >
          Export captions
        </a>
      </div>
      {dirty && (
        <p className="studio-muted">
          Save your changes before approving or publishing.
        </p>
      )}
      {draft.status === "approved" && !dirty && (
        <div className="studio-publish-box">
          <h3>
            {schedule ? "Schedule approved post" : "Publish approved post"}
          </h3>
          {testMode && (
            <p className="studio-muted">
              Live publishing is disabled on this password-free testing preview.
              Exports work now; live posting requires a private signed-in
              workspace.
            </p>
          )}
          {!connected && (
            <p>
              Publishing setup is still needed in Settings. Downloads and
              caption exports work now.
            </p>
          )}
          {selected.some(
            (id) =>
              destinations.find((d) => d.id === id)?.platform === "tiktok",
          ) && (
            <p className="studio-muted">
              TikTok direct posts are public. This keeps your audio, leaves
              comments on, and disables duet and stitch. For paid promotions or
              another audience, export and finish the post in TikTok.
            </p>
          )}
          <label>
            Post visibility
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
            >
              <option value="">Choose audience…</option>
              <option value="public">Public</option>
              <option value="unlisted">YouTube unlisted</option>
              <option value="private">YouTube private</option>
            </select>
          </label>
          {selected.some(
            (id) =>
              destinations.find((d) => d.id === id)?.platform === "tiktok",
          ) && (
            <>
              <label>
                TikTok promotion disclosure
                <select
                  value={commercialContent}
                  onChange={(e) => setCommercialContent(e.target.value)}
                >
                  <option value="none">No commercial promotion</option>
                  <option value="brand_organic">
                    Promoting my own brand / business
                  </option>
                  <option value="brand_content">
                    Paid promotion for another brand
                  </option>
                </select>
              </label>
              <label className="studio-check">
                <input
                  type="checkbox"
                  checked={allowComments}
                  onChange={(e) => setAllowComments(e.target.checked)}
                />
                Allow TikTok comments when the account permits them
              </label>
            </>
          )}
          <label className="studio-check">
            <input
              type="checkbox"
              checked={aiDisclosure}
              onChange={(e) => setAiDisclosure(e.target.checked)}
            />
            The media contains AI generated visuals or audio (TikTok disclosure)
          </label>
          <label className="studio-check">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I reviewed the media and captions, have permission to post this
            content, and approve the selected destinations.
          </label>
          <button
            className="studio-button"
            disabled={
              !consent ||
              !connected ||
              !selected.length ||
              !visibility ||
              testMode
            }
            onClick={() =>
              run(async () => {
                await request(`/api/studio/drafts/${draft.id}/publish`, {
                  consent: true,
                  visibility,
                  aiDisclosure,
                  commercialContent,
                  allowComments,
                });
              })
            }
          >
            {schedule
              ? "Schedule selected accounts"
              : "Publish to selected accounts"}
          </button>
        </div>
      )}
      {!editable && (
        <>
          <p className="studio-muted">
            Check the publishing service to change or cancel a submitted post.
            An uncertain request is held for review to prevent duplicate posts.
          </p>
          {draft.provider_post_id && (
            <button
              className="studio-button secondary"
              onClick={() =>
                run(async () => {
                  await request(`/api/studio/drafts/${draft.id}/refresh`, {});
                })
              }
            >
              Refresh publishing status
            </button>
          )}
          {draft.platform_results?.map((p, i) => (
            <p key={i}>
              {p.platform}: {p.status || "pending"}{" "}
              {p.error ? `· ${p.error}` : ""}
              {p.platformPostUrl?.startsWith("https://") && (
                <a href={p.platformPostUrl} target="_blank" rel="noreferrer">
                  Open post ↗
                </a>
              )}
            </p>
          ))}
        </>
      )}
    </section>
  );
}
