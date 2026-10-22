-- Bound optional AI spending even if several tabs submit at once.
create function public.reserve_studio_usage(target_workspace uuid,actor uuid,event_kind text,amount integer) returns void
language plpgsql security definer set search_path='' as $$
declare used integer;
begin
  if event_kind not in ('studio_ai_draft','studio_transcribe') or amount<1 or amount>20 then raise exception 'Invalid usage request'; end if;
  if not exists(select 1 from public.workspace_members where workspace_id=target_workspace and user_id=actor) then raise exception 'Workspace not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_workspace::text || event_kind,0));
  select coalesce(sum(credits),0) into used from public.usage_events where workspace_id=target_workspace and event_type=event_kind and created_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
  if used+amount>20 then raise exception 'Daily studio budget reached'; end if;
  insert into public.usage_events(workspace_id,user_id,event_type,credits) values(target_workspace,actor,event_kind,amount);
end; $$;
revoke all on function public.reserve_studio_usage(uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.reserve_studio_usage(uuid,uuid,text,integer) to service_role;
