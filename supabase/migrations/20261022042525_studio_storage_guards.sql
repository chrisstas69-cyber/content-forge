-- Only the server and queue may change processing results. Client uploads can name only their own storage parts.
revoke update on public.content_items from authenticated;
revoke insert,update,delete on public.processing_jobs from authenticated;
create function public.valid_media_sources(paths jsonb, owner_id uuid, workspace_id uuid, item_id uuid) returns boolean
language sql immutable set search_path='' as $$
  select case when jsonb_typeof(paths)='array' then
    jsonb_array_length(paths) between 1 and 120 and not exists (
      select 1 from jsonb_array_elements_text(paths) p
      where p not like owner_id::text || '/' || workspace_id::text || '/' || item_id::text || '/%'
         or p like '%..%' or p like '%\\%'
    ) else false end;
$$;
revoke all on function public.valid_media_sources(jsonb,uuid,uuid,uuid) from public,anon;
grant execute on function public.valid_media_sources(jsonb,uuid,uuid,uuid) to authenticated,service_role;
drop policy content_items_member_insert on public.content_items;
create policy content_items_member_insert on public.content_items for insert to authenticated
with check(user_id=(select auth.uid()) and public.is_workspace_member(workspace_id)
  and status='uploading' and output_path is null and thumbnail_path is null and metadata='{}'::jsonb
  and public.valid_media_sources(source_paths,user_id,workspace_id,id));
alter table public.content_items add constraint content_brand_item_unique unique(workspace_id,brand_id,id);
alter table public.post_drafts add constraint draft_media_brand_fk foreign key(workspace_id,brand_id,content_item_id) references public.content_items(workspace_id,brand_id,id);
-- Workspace members may review shared media without making the bucket public.
drop policy media_select_own_folder on storage.objects;
create policy media_select_workspace on storage.objects for select to authenticated
using(bucket_id='content-media' and exists(select 1 from public.workspace_members m where m.user_id=(select auth.uid()) and m.workspace_id::text=(storage.foldername(name))[2]));
