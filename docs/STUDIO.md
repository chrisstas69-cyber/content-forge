# Content Forge studio

The studio replaces the disconnected dashboard with **Create → Drafts → Publishing → Settings**. Choose Dog channel, Organizing business, or Music channel before uploading. Brand names, voice, audience, and factual instructions are editable.

## Working workflow

- Private direct uploads, resumable part retries, atomic/idempotent queue completion.
- One video or up to 20 photos per batch. Photos remain photos unless Slideshow is selected.
- Mac FFmpeg worker: original/vertical/square/landscape output with padding, video trim, original audio by default, optional mute, photo normalization, slideshows, previews, timed subtitle rendering.
- Editable captions per Instagram, TikTok, YouTube, and Facebook; explicit account destinations per brand; local-time schedule entry.
- AI drafts use sampled visual frames plus available transcript and brand instructions. OpenRouter / GPT-6 Luna is optional. No invented transcript timing or viral score.
- Download media and export/copy captions without any publishing subscription.
- Approval is invalidated by editing a draft or rendering its media again. Concurrent edits cannot silently overwrite each other.
- Queued worker jobs have renewable leases; interrupted jobs recover after five minutes, with at most three processing attempts.

## Connections

Enter optional keys in **Settings → Connections**, never in chat. Keys are encrypted with the server's `ENCRYPTION_KEY` and stored per workspace in a table inaccessible to browser roles. Owners/admins manage connections.

- **OpenRouter**: visual copy generation with `openai/gpt-6-luna`. The original testing owner can import the previously saved OpenRouter connection once; other users cannot access global legacy secrets.
- **Deepgram**: optional Nova-3 speech transcription with actual word timestamps. Review subtitles before rendering. No speech is invented for silent clips. Live transcription still needs a configured key and validation with spoken media.
- **Zernio**: managed Instagram, TikTok, YouTube, and Facebook publishing. Connect social accounts in its dashboard, refresh them in Settings, and assign each account to one brand. No publisher account/key is currently configured, so real social publishing remains unverified.

Daily AI limits are enforced transactionally per workspace: 20 draft requests and 20 minutes of speech transcription. Failed provider requests also consume the reserved limit to bound retry spending. Limits reset at midnight UTC. Provider credit is billed separately.

## Publishing behavior

The adapter transfers files into publisher storage before scheduling, so temporary Supabase links do not expire in the provider queue. It validates platform caption/media limits and fetches current TikTok creator permissions, duration/privacy limits, and promotion options. The user explicitly selects audience and destinations and confirms the preview/rights. TikTok direct posts in this studio are public; duet/stitch are off, comments and commercial/AI disclosures are explicit options.

Publishing claims a reviewed draft atomically before contacting the provider. An ambiguous POST response becomes **unknown** and cannot automatically submit a duplicate. Partial success stays partial; per-platform results can be refreshed. Change/cancel submitted posts in the publisher dashboard. A provider account connection and controlled live publishing test are still required before calling this production-ready.

**Password-free Preview mode cannot publish live posts.** It remains useful for uploads, rendering, AI drafting, review, and export. Use a private authenticated workspace before enabling live publication. Do not disable this guard on a public shared test session.

Legacy global settings, autonomous chat, trends, competitor scraping, viral scoring, AI image generation, comment automation, and billing routes return 410. Existing records are retained; successful older generated images remain viewable/exportable. Failed generation experiments are hidden from the studio.

## Mac worker

On this Mac a login agent runs the worker outside the chat:

- Agent: `~/Library/LaunchAgents/org.contentforge.worker.plist`
- Configuration: repo `.env.worker.local` (gitignored, mode 600)
- Logs: `~/Library/Logs/ContentForge/worker.log` and `worker-error.log`
- Health: `http://127.0.0.1:3101/health`
- Restart: `launchctl kickstart -k gui/$(id -u)/org.contentforge.worker`

The scoped Preview bridge keeps the Supabase service key off the Mac worker. Keep the Mac awake for new uploads/renders; already scheduled provider posts do not need it. The studio uses the worker's private heartbeat, so no public tunnel is required.

## Storage limits

Video source parts are at most 45 MiB. Each photo must be below 45 MiB. Current output objects must remain below Supabase Free's 50 MB cap; the worker bounds encoding bitrate and asks for a shorter clip when necessary. Images are JPEG-normalized; unsupported HEIC variants should be exported as JPEG/PNG. Output shapes preserve the full image using padding rather than automatic subject cropping. Rendering creates a new asset version and keeps originals.

## Verification

`pnpm run build`, `pnpm run test:checkup`, and `pnpm run test:studio` pass. Studio tests cover platform constraints, exact destinations, duplicate publishing prevention, ambiguous requests, photo/video rendering, real duration, audio preservation, and subtitle output. Focused ESLint passes.

Live Preview tests verified browser file selection/upload, private storage downloads, three brand profiles, manual and real GPT-6 Luna drafts, saving, stale-edit rejection, review invalidation, caption export, health heartbeat, one processing job after duplicate completion, and restart recovery of an expired lease. No public social post was sent.
