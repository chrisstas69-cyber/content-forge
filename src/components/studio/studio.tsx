"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  Clapperboard,
  FileText,
  LoaderCircle,
  Plus,
  RefreshCw,
  Settings2,
  UploadCloud,
} from "lucide-react";
import { mediaSettings } from "@/lib/studio/schema";
import { Bootstrap, Draft, request } from "./types";
import { UploadPlan, fileType, uploadFiles } from "./upload";
import { MediaEditor } from "./media-editor";
import { DraftEditor } from "./draft-editor";
import { StudioSettings } from "./settings";
import "./studio.css";

type Tab = "create" | "drafts" | "queue" | "settings";
export function Studio() {
  const [data, setData] = useState<Bootstrap | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [brandId, setBrandId] = useState(""),
    [tab, setTab] = useState<Tab>("create"),
    [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]),
    [progress, setProgress] = useState<number | null>(null),
    [ratio, setRatio] = useState("original"),
    [photoMode, setPhotoMode] = useState("photos");
  const [editorId, setEditorId] = useState<string | null>(null),
    [draftId, setDraftId] = useState<string | null>(null),
    [brief, setBrief] = useState(""),
    [hasPlan, setHasPlan] = useState(false);
  const plan = useRef<UploadPlan | null>(null),
    sequence = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    const result = await request<Bootstrap>(
      "/api/studio/bootstrap",
      undefined,
      "GET",
    );
    if (current === sequence.current) setData(result);
  }, []);
  useEffect(() => {
    let alive = true;
    refresh().catch((e) => {
      if (alive) setError(e.message);
    });
    const timer = setInterval(() => refresh().catch(() => {}), 10000);
    return () => {
      alive = false;
      sequence.current++;
      clearInterval(timer);
    };
  }, [refresh]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      await refresh();
      setMessage("Done.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Something went wrong. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  const brand = data?.brands.find((b) => b.id === brandId) || data?.brands[0];
  const items =
    data?.items.filter((i) => i.brand_id === brand?.id || !i.brand_id) || [];
  const drafts = data?.drafts.filter((d) => d.brand_id === brand?.id) || [];
  const currentDraft = drafts.find((d) => d.id === draftId);
  const currentItem = data?.items.find((i) => i.id === editorId);
  const draftItem = data?.items.find(
    (i) => i.id === currentDraft?.content_item_id,
  );
  const connections = new Set(data?.integrations.map((i) => i.provider));
  const draftList = drafts.filter((d) =>
    ["draft", "approved", "failed"].includes(d.status),
  );
  const queued = drafts.filter(
    (d) => !["draft", "approved"].includes(d.status),
  );
  const createDraft = (contentId: string, generate: boolean) =>
    run(async () => {
      const result = await request<{ draft: Draft }>("/api/studio/drafts", {
        content_item_id: contentId,
        brand_id: brand!.id,
        generate,
        brief,
      });
      setDraftId(result.draft.id);
      setTab("drafts");
      setEditorId(null);
    });
  const upload = () =>
    run(async () => {
      if (!files.length || !brand) throw new Error("Choose media first.");
      setProgress(0);
      if (!plan.current) {
        const result = await request<Omit<UploadPlan, "completed">>(
          "/api/uploads/start",
          {
            brandId: brand.id,
            files: files.map((f) => ({
              name: f.name,
              type: fileType(f),
              size: f.size,
            })),
            settings: mediaSettings.parse({ ratio, photoMode }),
          },
        );
        plan.current = { ...result, completed: new Set() };
        setHasPlan(true);
      }
      await uploadFiles(files, plan.current, setProgress);
      await request("/api/uploads/complete", { itemId: plan.current.itemId });
      plan.current = null;
      setHasPlan(false);
      setFiles([]);
      setProgress(null);
    });
  if (!data || !brand)
    return (
      <div className="studio studio-loading">
        <Clapperboard size={32} />
        <h1>Content Forge</h1>
        <p>{error || "Opening your studio…"}</p>
        {error && (
          <button className="studio-button" onClick={() => run(refresh)}>
            Retry
          </button>
        )}
      </div>
    );
  const navigation: {
    id: Tab;
    label: string;
    icon: typeof Plus;
    count?: number;
  }[] = [
    { id: "create", label: "Create", icon: Plus },
    { id: "drafts", label: "Drafts", icon: FileText, count: draftList.length },
    {
      id: "queue",
      label: "Publishing",
      icon: CheckCircle2,
      count: queued.length,
    },
    { id: "settings", label: "Settings", icon: Settings2 },
  ];
  return (
    <div className="studio">
      <header className="studio-header">
        <a className="studio-wordmark" href="/app">
          <span>
            <Clapperboard size={22} />
          </span>
          Content Forge
        </a>
        <div className="studio-header-right">
          {data.testMode && (
            <span className="studio-test">Testing preview</span>
          )}
          <span className="studio-worker">
            <span
              className={`studio-dot ${data.worker.online ? "online" : ""}`}
            />
            Mac {data.worker.online ? "online" : "offline"}
          </span>
          <button
            aria-label="Refresh studio"
            title="Refresh studio"
            className="studio-icon-button"
            onClick={() => run(refresh)}
            disabled={busy}
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </header>
      <div className="studio-layout">
        <aside className="studio-sidebar">
          <label className="studio-brand-label">
            YOUR BRAND
            <select
              aria-label="Choose brand"
              value={brand.id}
              disabled={busy || hasPlan}
              onChange={(e) => {
                setBrandId(e.target.value);
                setDraftId(null);
                setEditorId(null);
              }}
            >
              {data.brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <nav aria-label="Studio">
            {navigation.map((n) => (
              <button
                key={n.id}
                className={tab === n.id ? "active" : ""}
                onClick={() => {
                  setTab(n.id);
                  setEditorId(null);
                  if (n.id !== "drafts" && n.id !== "queue") setDraftId(null);
                }}
              >
                <n.icon size={19} />
                {n.label}
                {n.count ? <span>{n.count}</span> : null}
              </button>
            ))}
          </nav>
          <div className="studio-sidebar-note">
            <span style={{ background: brand.color }} />
            {brand.name}
            <p>
              Upload. Shape it.
              <br />
              Review. Share it.
            </p>
          </div>
        </aside>
        <main className="studio-main">
          <div className="studio-page-heading">
            <div>
              <p className="studio-eyebrow">{brand.name}</p>
              <h1>
                {tab === "create"
                  ? "Make something worth sharing."
                  : tab === "drafts"
                    ? "Your words. Your final say."
                    : tab === "queue"
                      ? "Follow every post."
                      : "Set up your studio."}
              </h1>
              <p className="studio-muted">
                {tab === "create"
                  ? "Start with your own videos and photos. Keep the good parts, make a draft, then review it."
                  : tab === "drafts"
                    ? "Review the media, tune each caption, and choose exactly where it goes."
                    : tab === "queue"
                      ? "Submitted posts and confirmed platform results. Nothing publishes without your approval."
                      : "Three separate brands. One simple workflow."}
              </p>
            </div>
          </div>
          <div aria-live="polite">
            {busy && (
              <div className="studio-notice">
                <LoaderCircle className="studio-spin" size={17} />
                {progress !== null ? `Uploading · ${progress}%` : "Working…"}
              </div>
            )}
            {error && (
              <div className="studio-alert" role="alert">
                {error}
              </div>
            )}
            {message && !busy && (
              <div className="studio-success">{message}</div>
            )}
          </div>
          <fieldset className="studio-fields" disabled={busy}>
            {tab === "create" && !currentItem && (
              <>
                <section className="studio-panel studio-upload">
                  <div className="studio-upload-intro">
                    <span className="studio-upload-icon">
                      <UploadCloud size={30} />
                    </span>
                    <h2>What are we making today?</h2>
                    <p>
                      One video or up to 20 photos. Your originals stay private.
                    </p>
                  </div>
                  <label className="studio-file-picker">
                    Choose videos or photos
                    <input
                      aria-label="Choose videos or photos"
                      type="file"
                      accept="video/mp4,video/quicktime,video/webm,image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,.mov"
                      multiple
                      onChange={(e) => {
                        setFiles(Array.from(e.target.files || []));
                        plan.current = null;
                        setHasPlan(false);
                        setProgress(null);
                      }}
                    />
                  </label>
                  {files.length > 0 && (
                    <div className="studio-selected-files">
                      {files.map((f, i) => (
                        <p key={i}>
                          {f.name}{" "}
                          <small>{(f.size / 1024 / 1024).toFixed(1)} MB</small>
                        </p>
                      ))}
                    </div>
                  )}
                  <div className="studio-form-grid">
                    <label>
                      Output shape
                      <select
                        value={ratio}
                        disabled={hasPlan}
                        onChange={(e) => setRatio(e.target.value)}
                      >
                        <option value="original">Keep original shape</option>
                        <option value="9:16">
                          Vertical · Reels / TikTok / Shorts
                        </option>
                        <option value="1:1">Square</option>
                        <option value="16:9">Landscape</option>
                      </select>
                    </label>
                    {(!files.length ||
                      files.every((f) => fileType(f).startsWith("image/"))) && (
                      <label>
                        Photos become
                        <select
                          value={photoMode}
                          disabled={hasPlan}
                          onChange={(e) => setPhotoMode(e.target.value)}
                        >
                          <option value="photos">Photos / carousel</option>
                          <option value="slideshow">Slideshow video</option>
                        </select>
                      </label>
                    )}
                  </div>
                  <div className="studio-row">
                    <button
                      className="studio-button"
                      disabled={!files.length}
                      onClick={upload}
                    >
                      {hasPlan ? "Resume upload" : "Upload & prepare"}{" "}
                      <ArrowUpRight size={16} />
                    </button>
                    <small className="studio-muted">
                      Original audio is preserved.
                    </small>
                  </div>
                  {!data.worker.online && (
                    <p className="studio-muted">
                      The Mac worker is offline. Uploads will wait safely in the
                      queue until it reconnects.
                    </p>
                  )}
                </section>
                <section className="studio-panel">
                  <label>
                    Context for your next AI draft{" "}
                    <span className="studio-muted">· optional</span>
                    <textarea
                      rows={2}
                      value={brief}
                      onChange={(e) => setBrief(e.target.value)}
                      placeholder="Names, what happened, track credits, or the message you want to share…"
                      maxLength={2000}
                    />
                  </label>
                  <small className="studio-muted">
                    Only facts you provide and visible media guide the draft. AI
                    drafts use GPT-6 Luna when connected.
                  </small>
                </section>
                <div className="studio-section-heading">
                  <h2>
                    Your media{" "}
                    <span className="studio-muted">{items.length}</span>
                  </h2>
                  <span className="studio-muted">
                    {items.filter((i) => i.status === "ready").length} ready
                  </span>
                </div>
                {!items.length && (
                  <div className="studio-empty">
                    Your first upload starts here. Add a video or a few photos
                    above.
                  </div>
                )}
                <div className="studio-media-grid">
                  {items.map((item) => (
                    <article key={item.id} className="studio-media-card">
                      <button
                        className="studio-card-image"
                        aria-label={`Open ${item.filename}`}
                        onClick={() => setEditorId(item.id)}
                      >
                        {item.thumbnail_path ? (
                          <img
                            src={`/api/media/${item.id}/thumbnail`}
                            alt=""
                            loading="lazy"
                          />
                        ) : (
                          <Clapperboard size={36} />
                        )}
                        <span className={`studio-badge ${item.status}`}>
                          {item.status}
                        </span>
                      </button>
                      <div className="studio-card-body">
                        <h3 title={item.filename}>{item.filename}</h3>
                        <p className="studio-muted">
                          {item.kind}
                          {item.metadata.durationSec
                            ? ` · ${Math.round(item.metadata.durationSec)}s`
                            : ""}
                          {!item.brand_id ? " · previous import" : ""}
                        </p>
                        {["queued", "processing", "uploading"].includes(
                          item.status,
                        ) && (
                          <>
                            <progress max={100} value={item.progress} />
                            <small>{item.current_step || "Uploading"}</small>
                          </>
                        )}
                        {item.error_message && (
                          <p className="studio-error-text">
                            {item.error_message}
                          </p>
                        )}
                        <div className="studio-card-actions">
                          <button
                            className="studio-button secondary"
                            onClick={() => setEditorId(item.id)}
                          >
                            Edit / export
                          </button>
                          {item.status === "ready" && (
                            <>
                              <button
                                className="studio-button"
                                onClick={() => createDraft(item.id, true)}
                              >
                                Generate draft
                              </button>
                              <button
                                className="studio-text-button"
                                onClick={() => createDraft(item.id, false)}
                              >
                                Write my own draft
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
            {tab === "create" && currentItem && (
              <MediaEditor
                key={currentItem.id}
                item={currentItem}
                done={() => setEditorId(null)}
                run={run}
              />
            )}
            {(tab === "drafts" || tab === "queue") && (
              <div className="studio-review-layout">
                <section className="studio-draft-list">
                  {(tab === "drafts" ? draftList : queued).map((d) => (
                    <button
                      key={d.id}
                      className={d.id === draftId ? "selected" : ""}
                      onClick={() => setDraftId(d.id)}
                    >
                      <span className={`studio-badge ${d.status}`}>
                        {d.status}
                      </span>
                      <strong>{d.title || "Untitled post"}</strong>
                      <small>
                        {d.scheduled_for
                          ? new Date(d.scheduled_for).toLocaleString()
                          : "No schedule"}
                      </small>
                    </button>
                  ))}
                  {!(tab === "drafts" ? draftList : queued).length && (
                    <div className="studio-empty">
                      {tab === "drafts"
                        ? "Make a draft from ready media on the Create tab."
                        : "Posts appear here after you submit them. You can review and export drafts without a publishing connection."}
                    </div>
                  )}
                </section>
                {currentDraft && draftItem ? (
                  <DraftEditor
                    key={`${currentDraft.id}:${currentDraft.updated_at}`}
                    draft={currentDraft}
                    item={draftItem}
                    destinations={data.destinations.filter(
                      (a) => a.brand_id === brand.id,
                    )}
                    run={run}
                    connected={connections.has("zernio")}
                    testMode={data.testMode}
                  />
                ) : (
                  <div className="studio-empty studio-select-draft">
                    <FileText size={32} />
                    <p>Select a post to review it.</p>
                  </div>
                )}
              </div>
            )}
            {tab === "settings" && (
              <StudioSettings
                key={brand.id}
                data={data}
                brand={brand}
                run={run}
              />
            )}
          </fieldset>
          <footer className="studio-footer">
            Built around your content. Instagram · TikTok · YouTube · Facebook
          </footer>
        </main>
      </div>
    </div>
  );
}
