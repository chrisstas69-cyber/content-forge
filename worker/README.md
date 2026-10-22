# ContentForge processing worker

Deploy this directory as a Docker service with persistent outbound network access.

Required environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional variables: `PORT`, `WORKER_ID`, and `POLL_INTERVAL_MS`.

Set `CONTENT_WORKER_URL` on the Next.js app to the worker's reachable base URL
in both Preview and Production. `/api/dashboard/health` checks the worker's
`/health` endpoint and returns 503 when it cannot confirm a healthy worker.

The worker atomically claims `processing_jobs`, downloads private source media, renders an MP4 and thumbnail with FFmpeg, uploads both to private Supabase Storage, and marks the item ready. Failed jobs retry up to three times.

For Mac testing without exporting the database service key, use the preview
bridge. Configure a random `CONTENT_WORKER_TOKEN` on the test branch's Preview
environment and in a gitignored `.env.worker.local` file. That file also needs
`CONTENT_WORKER_APP_URL` (the preview URL), `PORT=3101`,
`WORKER_HOST=127.0.0.1`, and a stable `WORKER_ID`.

Start from the repository root:

```sh
node --env-file=.env.worker.local worker/src/index.mjs
```

The bridge is available only on Preview deployments with `TEST_MODE_ENABLED=true`.
It signs media transfers and limits updates to the worker's claimed job; it never
returns the Supabase service key. The local worker polls the queue, so the browser
can use the preview without exposing a port on this Mac. `CONTENT_WORKER_URL` may
stay unset in this mode; a hosted readiness probe cannot reach a loopback worker.
