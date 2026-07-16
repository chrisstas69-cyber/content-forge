# ContentForge processing worker

Deploy this directory as a Docker service with persistent outbound network access.

Required environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional variables: `PORT`, `WORKER_ID`, and `POLL_INTERVAL_MS`.

The worker atomically claims `processing_jobs`, downloads private source media, renders an MP4 and thumbnail with FFmpeg, uploads both to private Supabase Storage, and marks the item ready. Failed jobs retry up to three times.
