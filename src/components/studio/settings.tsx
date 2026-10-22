"use client";
import { useState } from "react";
import { Bootstrap, Brand, request } from "./types";

type Account = { remote_id: string; platform: string; display_name: string };
export function StudioSettings({
  data,
  brand,
  run,
}: {
  data: Bootstrap;
  brand: Brand;
  run: (action: () => Promise<void>) => void;
}) {
  const [name, setName] = useState(brand.name),
    [tone, setTone] = useState(brand.tone),
    [audience, setAudience] = useState(brand.audience),
    [instructions, setInstructions] = useState(brand.instructions);
  const [provider, setProvider] = useState("openrouter"),
    [key, setKey] = useState(""),
    [accounts, setAccounts] = useState<Account[]>([]);
  return (
    <div className="studio-settings-grid">
      <section className="studio-panel">
        <h2>{brand.name} profile</h2>
        <p className="studio-muted">
          These instructions guide this brand’s drafts. They never mix with your
          other channels.
        </p>
        <label>
          Brand name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
          />
        </label>
        <label>
          Voice and tone
          <textarea
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            rows={3}
          />
        </label>
        <label>
          Audience
          <textarea
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            rows={2}
          />
        </label>
        <label>
          Facts and instructions
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={5}
          />
        </label>
        <button
          className="studio-button"
          onClick={() =>
            run(async () => {
              await request(
                `/api/studio/brands/${brand.id}`,
                { name, tone, audience, instructions },
                "PATCH",
              );
            })
          }
        >
          Save brand profile
        </button>
      </section>
      <div className="studio-stack">
        <section className="studio-panel">
          <h2>Connections</h2>
          <ul className="studio-connection-list">
            {[
              ["openrouter", "AI drafts · GPT-6 Luna"],
              ["deepgram", "Speech subtitles · Nova-3"],
              ["zernio", "Social publishing · Zernio"],
            ].map(([id, label]) => (
              <li key={id}>
                <span>{label}</span>
                <span
                  className={`studio-badge ${data.integrations.some((i) => i.provider === id) ? "ready" : ""}`}
                >
                  {data.integrations.some((i) => i.provider === id)
                    ? "Connected"
                    : "Optional setup"}
                </span>
              </li>
            ))}
          </ul>
          <p className="studio-muted">
            AI runs only when you request a draft or transcription. Manual
            drafts, editing, and exports work without paid AI.
          </p>
          {data.owner && (
            <>
              <label>
                Connection
                <select
                  value={provider}
                  onChange={(e) => {
                    setProvider(e.target.value);
                    setKey("");
                  }}
                >
                  <option value="openrouter">OpenRouter · AI drafts</option>
                  <option value="deepgram">Deepgram · timed speech</option>
                  <option value="zernio">Zernio · publishing</option>
                </select>
              </label>
              <label>
                API key
                <input
                  type="password"
                  autoComplete="new-password"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="Enter securely here, never in chat"
                />
              </label>
              <div className="studio-row">
                <button
                  className="studio-button"
                  disabled={!key.trim()}
                  onClick={() =>
                    run(async () => {
                      await request("/api/studio/integrations", {
                        provider,
                        key,
                      });
                      setKey("");
                    })
                  }
                >
                  Save connection
                </button>
                {data.testMode &&
                  !data.integrations.some(
                    (i) => i.provider === "openrouter",
                  ) && (
                    <button
                      className="studio-button secondary"
                      onClick={() =>
                        run(async () => {
                          await request("/api/studio/import-saved-ai", {});
                        })
                      }
                    >
                      Use saved AI connection
                    </button>
                  )}
              </div>
            </>
          )}
          <p className="studio-muted">
            Keys are encrypted on the server and never displayed again.{" "}
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noreferrer"
            >
              OpenRouter
            </a>{" "}
            ·{" "}
            <a
              href="https://console.deepgram.com/"
              target="_blank"
              rel="noreferrer"
            >
              Deepgram
            </a>{" "}
            ·{" "}
            <a href="https://zernio.com/" target="_blank" rel="noreferrer">
              Zernio
            </a>
          </p>
        </section>
        <section className="studio-panel">
          <h2>Social accounts for {brand.name}</h2>
          <p className="studio-muted">
            Connect Instagram, TikTok, YouTube, and Facebook in Zernio, then
            refresh and assign each account here. Each account belongs to one
            brand.
          </p>
          {data.destinations
            .filter((d) => d.brand_id === brand.id)
            .map((d) => (
              <p key={d.id}>
                <strong>{d.platform}</strong> · {d.display_name}
              </p>
            ))}
          {data.owner && (
            <button
              className="studio-button secondary"
              onClick={() =>
                run(async () => {
                  const result = await request<{ accounts: Account[] }>(
                    "/api/studio/publisher-accounts",
                    undefined,
                    "GET",
                  );
                  setAccounts(result.accounts);
                })
              }
            >
              Refresh connected accounts
            </button>
          )}
          {accounts.map((a) => (
            <div className="studio-account" key={a.remote_id}>
              <div>
                <strong>{a.display_name}</strong>
                <small>
                  {a.platform}
                  {data.destinations.find((d) => d.remote_id === a.remote_id)
                    ? ` · assigned to ${data.brands.find((b) => b.id === data.destinations.find((d) => d.remote_id === a.remote_id)?.brand_id)?.name}`
                    : ""}
                </small>
              </div>
              <button
                className="studio-button secondary"
                onClick={() =>
                  run(async () => {
                    await request("/api/studio/destinations", {
                      brand_id: brand.id,
                      remote_id: a.remote_id,
                    });
                  })
                }
              >
                Assign to this brand
              </button>
            </div>
          ))}
        </section>
        <section className="studio-panel">
          <h2>Mac processing</h2>
          <p>
            <span
              className={`studio-dot ${data.worker.online ? "online" : ""}`}
            />
            {data.worker.online
              ? data.worker.busy
                ? "Mac is processing media"
                : "Mac worker is online"
              : "Mac worker is offline"}
          </p>
          <p className="studio-muted">
            Keep this Mac awake for new uploads and renders. Uploaded originals
            and saved drafts stay in private storage. Already scheduled posts
            run through the publisher.
          </p>
        </section>
      </div>
    </div>
  );
}
