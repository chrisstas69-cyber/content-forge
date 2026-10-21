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
