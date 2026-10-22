-- Add the studio alongside existing media; keep all existing uploads and legacy records.
create table public.brand_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  slug text not null, name text not null, tone text not null default '',
  audience text not null default '', instructions text not null default '',
  color text not null default '#6366f1', created_at timestamptz not null default now(),
  unique (workspace_id, slug), unique (workspace_id, id)
);
alter table public.content_items add column brand_id uuid;
alter table public.content_items add constraint content_brand_workspace_fk foreign key (workspace_id, brand_id) references public.brand_profiles(workspace_id,id);
alter table public.content_items drop constraint content_items_kind_check;
alter table public.content_items add constraint content_items_kind_check check (kind in ('video','slideshow','image','carousel'));
alter table public.content_items add constraint content_workspace_id_unique unique (workspace_id,id);
create index content_items_brand_created_idx on public.content_items(brand_id,created_at desc);

create table public.studio_integrations (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('openrouter','deepgram','zernio')),
  cipher_text text not null, updated_at timestamptz not null default now(),
  primary key (workspace_id,provider)
);
create table public.social_destinations (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
  brand_id uuid not null, remote_id text not null,
  platform text not null check (platform in ('instagram','tiktok','youtube','facebook')),
  display_name text not null, profile_id text,
  created_at timestamptz not null default now(),
  foreign key (workspace_id,brand_id) references public.brand_profiles(workspace_id,id),
  unique (workspace_id,remote_id), unique (workspace_id,id)
);
create index social_destinations_brand_idx on public.social_destinations(brand_id);
create table public.post_drafts (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
  brand_id uuid not null, content_item_id uuid not null,
  title text not null default '', caption text not null default '',
  variants jsonb not null default '{}'::jsonb, destination_ids jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','approved','submitting','scheduled','published','partial','failed','unknown')),
  media_version text, scheduled_for timestamptz, provider_post_id text,
  platform_results jsonb not null default '[]'::jsonb, error_message text,
  source text not null default 'manual', created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id,brand_id) references public.brand_profiles(workspace_id,id),
  foreign key (workspace_id,content_item_id) references public.content_items(workspace_id,id)
);
create index post_drafts_brand_created_idx on public.post_drafts(brand_id,created_at desc);
create index post_drafts_content_idx on public.post_drafts(content_item_id);
create table public.worker_heartbeats (
  worker_id text primary key, seen_at timestamptz not null default now(),
  busy boolean not null default false, last_error text
);

alter table public.brand_profiles enable row level security;
alter table public.studio_integrations enable row level security;
alter table public.social_destinations enable row level security;
alter table public.post_drafts enable row level security;
alter table public.worker_heartbeats enable row level security;
create policy brands_read on public.brand_profiles for select to authenticated using(public.is_workspace_member(workspace_id));
create policy destinations_read on public.social_destinations for select to authenticated using(public.is_workspace_member(workspace_id));
create policy drafts_read on public.post_drafts for select to authenticated using(public.is_workspace_member(workspace_id));
-- All studio mutations go through the server after checking membership. Secrets never leave it.
revoke all on public.studio_integrations, public.worker_heartbeats from anon,authenticated;
revoke all on public.brand_profiles,public.social_destinations,public.post_drafts from anon,authenticated;
grant select on public.brand_profiles,public.social_destinations,public.post_drafts to authenticated;
grant all on public.brand_profiles,public.studio_integrations,public.social_destinations,public.post_drafts,public.worker_heartbeats to service_role;
revoke execute on function public.handle_new_user() from public,anon,authenticated;
revoke execute on function public.is_workspace_member(uuid) from public,anon;
grant execute on function public.is_workspace_member(uuid) to authenticated,service_role;

-- Finalizing twice is harmless; validate every storage part before queuing in the same transaction.
create function public.finish_media_upload(item_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare item public.content_items; expected integer; actual integer;
begin
  select * into item from public.content_items where id=item_id for update;
  if item.id is null or item.user_id <> auth.uid() or not public.is_workspace_member(item.workspace_id) then raise exception 'Upload not found'; end if;
  if item.status <> 'uploading' then return item.id; end if;
  expected := jsonb_array_length(item.source_paths);
  select count(*) into actual from storage.objects o where o.bucket_id='content-media' and o.name in (select jsonb_array_elements_text(item.source_paths));
  if expected=0 or actual<>expected then raise exception 'Upload is incomplete. Retry the missing files.'; end if;
  update public.content_items set status='queued',progress=0,current_step='Waiting for Mac worker',updated_at=now() where id=item.id;
  insert into public.processing_jobs(workspace_id,content_item_id,user_id) values(item.workspace_id,item.id,item.user_id);
  return item.id;
end; $$;
revoke all on function public.finish_media_upload(uuid) from public,anon;
grant execute on function public.finish_media_upload(uuid) to authenticated;

-- A sleeping/restarted Mac cannot strand a job indefinitely. The worker renews leases while busy.
create or replace function public.claim_processing_job(worker_id text)
returns table(job_id uuid,attempts integer,content_item_id uuid,workspace_id uuid,user_id uuid,kind text,filename text,mime_type text,source_paths jsonb,edit_settings jsonb,metadata jsonb)
language plpgsql security definer set search_path = public as $$
begin
  update public.content_items i set status='failed',error_message='Processing interrupted three times. Retry from the library.',current_step=null
  from public.processing_jobs j where j.content_item_id=i.id and j.status='running' and j.locked_at<now()-interval '5 minutes' and j.attempts>=3;
  update public.processing_jobs j set status=case when j.attempts>=3 then 'failed' else 'queued' end,locked_at=null,locked_by=null,updated_at=now()
  where j.status='running' and j.locked_at<now()-interval '5 minutes';
  return query with next_job as (
    select j.id from public.processing_jobs j where j.status='queued' order by j.created_at for update skip locked limit 1
  ), claimed as (
    update public.processing_jobs j set status='running',attempts=j.attempts+1,locked_at=now(),locked_by=worker_id,updated_at=now()
    from next_job n where j.id=n.id returning j.*
  ) select c.id,c.attempts,i.id,i.workspace_id,i.user_id,i.kind,i.filename,i.mime_type,i.source_paths,i.edit_settings,i.metadata
  from claimed c join public.content_items i on i.id=c.content_item_id;
end; $$;
revoke all on function public.claim_processing_job(text) from public,anon,authenticated;
grant execute on function public.claim_processing_job(text) to service_role;

create function public.requeue_studio_media(item_id uuid, target_workspace uuid, new_settings jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare item public.content_items; new_job uuid;
begin
  select * into item from public.content_items where id=item_id and workspace_id=target_workspace for update;
  if item.id is null or item.status not in ('ready','failed') then raise exception 'Wait for the current render to finish'; end if;
  update public.post_drafts set status='draft',media_version=null,updated_at=now() where content_item_id=item_id and status in ('draft','approved','failed');
  update public.content_items set status='queued',progress=0,error_message=null,current_step='Waiting for Mac worker',edit_settings=new_settings,updated_at=now() where id=item_id;
  insert into public.processing_jobs(workspace_id,content_item_id,user_id) values(item.workspace_id,item.id,item.user_id) returning id into new_job;
  return new_job;
end; $$;
revoke all on function public.requeue_studio_media(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.requeue_studio_media(uuid,uuid,jsonb) to service_role;

create function public.claim_studio_publish(draft_id uuid,target_workspace uuid) returns public.post_drafts
language plpgsql security definer set search_path='' as $$
declare draft public.post_drafts; item public.content_items;
begin
  select * into draft from public.post_drafts where id=draft_id and workspace_id=target_workspace for update;
  if draft.id is null or draft.status<>'approved' then raise exception 'Review and approve this draft first'; end if;
  select * into item from public.content_items where id=draft.content_item_id for update;
  if item.status<>'ready' or draft.media_version is distinct from item.output_path then raise exception 'Media changed. Review the new render before posting'; end if;
  update public.post_drafts set status='submitting',error_message=null,updated_at=now() where id=draft.id returning * into draft;
  return draft;
end; $$;
revoke all on function public.claim_studio_publish(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_studio_publish(uuid,uuid) to service_role;
