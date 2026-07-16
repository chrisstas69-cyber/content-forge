-- ContentForge SaaS foundation. Run with Supabase CLI or in the SQL editor.
create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  stripe_customer_id text unique,
  plan text not null default 'free' check (plan in ('free','creator','pro')),
  subscription_status text not null default 'inactive',
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  credits integer not null default 1 check (credits > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_workspace_created_idx on public.usage_events(workspace_id, created_at desc);
create index if not exists workspace_members_user_idx on public.workspace_members(user_id);

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.usage_events enable row level security;

create policy "profiles_select_own" on public.profiles for select using ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "workspaces_member_select" on public.workspaces for select using (exists (select 1 from public.workspace_members m where m.workspace_id = id and m.user_id = (select auth.uid())));
create policy "workspaces_owner_update" on public.workspaces for update using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "members_member_select" on public.workspace_members for select using (exists (select 1 from public.workspace_members self where self.workspace_id = workspace_id and self.user_id = (select auth.uid())));
create policy "usage_member_select" on public.usage_events for select using (exists (select 1 from public.workspace_members m where m.workspace_id = usage_events.workspace_id and m.user_id = (select auth.uid())));

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare new_workspace_id uuid;
begin
  insert into public.profiles (id, full_name) values (new.id, new.raw_user_meta_data ->> 'full_name');
  insert into public.workspaces (owner_id, name, slug) values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)) || '''s Workspace', new.id::text) returning id into new_workspace_id;
  insert into public.workspace_members (workspace_id, user_id, role) values (new_workspace_id, new.id, 'owner');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- Customer content tables should receive a workspace_id column before launch.
-- Apply the same membership policy to every migrated content table. Until that
-- migration is complete, the Next.js proxy keeps the legacy personal APIs
-- authenticated and the product should remain in controlled beta.
