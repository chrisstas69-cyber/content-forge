-- Durable, workspace-scoped media uploads and processing queue.
create or replace function public.is_workspace_member(check_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members where workspace_id = check_workspace_id and user_id = auth.uid());
$$;
revoke all on function public.is_workspace_member(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;

-- Replace the recursive foundation policies with the security-definer helper.
drop policy if exists "workspaces_member_select" on public.workspaces;
create policy "workspaces_member_select" on public.workspaces for select using (public.is_workspace_member(id));
drop policy if exists "members_member_select" on public.workspace_members;
create policy "members_member_select" on public.workspace_members for select using (public.is_workspace_member(workspace_id));
drop policy if exists "usage_member_select" on public.usage_events;
create policy "usage_member_select" on public.usage_events for select using (public.is_workspace_member(workspace_id));

create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, filename text not null,
  kind text not null check (kind in ('video', 'slideshow')), mime_type text not null,
  size_bytes bigint not null default 0 check (size_bytes >= 0), source_paths jsonb not null default '[]'::jsonb,
  output_path text, thumbnail_path text,
  status text not null default 'uploading' check (status in ('uploading','queued','processing','ready','failed')),
  progress integer not null default 0 check (progress between 0 and 100), current_step text, error_message text,
  edit_settings jsonb not null default '{}'::jsonb, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.processing_jobs (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  attempts integer not null default 0, locked_at timestamptz, locked_by text, error_message text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists content_items_workspace_created_idx on public.content_items(workspace_id, created_at desc);
create index if not exists processing_jobs_status_created_idx on public.processing_jobs(status, created_at);
alter table public.content_items enable row level security;
alter table public.processing_jobs enable row level security;
drop policy if exists "content_items_member_select" on public.content_items;
create policy "content_items_member_select" on public.content_items for select using (public.is_workspace_member(workspace_id));
drop policy if exists "content_items_member_insert" on public.content_items;
create policy "content_items_member_insert" on public.content_items for insert with check (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));
drop policy if exists "content_items_owner_update" on public.content_items;
create policy "content_items_owner_update" on public.content_items for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "content_items_owner_delete" on public.content_items;
create policy "content_items_owner_delete" on public.content_items for delete using (user_id = (select auth.uid()));
drop policy if exists "processing_jobs_member_select" on public.processing_jobs;
create policy "processing_jobs_member_select" on public.processing_jobs for select using (public.is_workspace_member(workspace_id));
drop policy if exists "processing_jobs_member_insert" on public.processing_jobs;
create policy "processing_jobs_member_insert" on public.processing_jobs for insert with check (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('content-media','content-media',false,5368709120,array['video/mp4','video/quicktime','video/webm','image/jpeg','image/png','image/webp','image/heic','image/heif']) on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "media_insert_own_folder" on storage.objects;
create policy "media_insert_own_folder" on storage.objects for insert to authenticated with check (bucket_id='content-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "media_select_own_folder" on storage.objects;
create policy "media_select_own_folder" on storage.objects for select to authenticated using (bucket_id='content-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "media_delete_own_folder" on storage.objects;
create policy "media_delete_own_folder" on storage.objects for delete to authenticated using (bucket_id='content-media' and (storage.foldername(name))[1]=(select auth.uid())::text);

-- The external worker uses the service role to atomically claim one queued job.
create or replace function public.claim_processing_job(worker_id text)
returns table (
  job_id uuid, attempts integer, content_item_id uuid, workspace_id uuid, user_id uuid,
  kind text, filename text, mime_type text, source_paths jsonb, edit_settings jsonb, metadata jsonb
)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with next_job as (
    select j.id from public.processing_jobs j
    where j.status = 'queued'
    order by j.created_at
    for update skip locked
    limit 1
  ), claimed as (
    update public.processing_jobs j
    set status='running', attempts=j.attempts+1, locked_at=now(), locked_by=worker_id, updated_at=now()
    from next_job n
    where j.id=n.id
    returning j.*
  )
  select c.id, c.attempts, i.id, i.workspace_id, i.user_id, i.kind, i.filename, i.mime_type,
         i.source_paths, i.edit_settings, i.metadata
  from claimed c join public.content_items i on i.id=c.content_item_id;
end;
$$;
revoke all on function public.claim_processing_job(text) from public, anon, authenticated;
grant execute on function public.claim_processing_job(text) to service_role;
