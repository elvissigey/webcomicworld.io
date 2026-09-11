-- WebComicWorld production features.
-- Applied to the connected Supabase project.
-- This migration records the production authorization, publishing,
-- moderation, storage and metrics layer used by the application.

begin;

-- Least-privilege engagement policies.
drop policy if exists "own bookmarks" on public.bookmarks;
drop policy if exists "users manage own bookmarks" on public.bookmarks;
create policy "users manage own bookmarks" on public.bookmarks for all to authenticated
  using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists "own follows" on public.comic_follows;
drop policy if exists "users manage own follows" on public.comic_follows;
create policy "users manage own follows" on public.comic_follows for all to authenticated
  using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists "own history" on public.history;
drop policy if exists "users manage own history" on public.history;
create policy "users manage own history" on public.history for all to authenticated
  using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists "own progress" on public.reading_progress;
drop policy if exists "users manage own progress" on public.reading_progress;
create policy "users manage own progress" on public.reading_progress for all to authenticated
  using (user_id=auth.uid()) with check (user_id=auth.uid() and page_number >= 1 and scroll_percent between 0 and 100);

drop policy if exists "own rating updates" on public.ratings;
drop policy if exists "users manage own ratings" on public.ratings;
create policy "users manage own ratings" on public.ratings for all to authenticated
  using (user_id=auth.uid()) with check (user_id=auth.uid() and rating between 1 and 5);

drop policy if exists "own reviews" on public.reviews;
drop policy if exists "users manage own reviews" on public.reviews;
create policy "users manage own reviews" on public.reviews for all to authenticated
  using (user_id=auth.uid()) with check (user_id=auth.uid() and length(trim(body)) between 1 and 5000);

drop policy if exists "own comments" on public.comments;
drop policy if exists "users create comments" on public.comments;
drop policy if exists "users update own comments" on public.comments;
drop policy if exists "users delete own comments" on public.comments;
create policy "users create comments" on public.comments for insert to authenticated
  with check (user_id=auth.uid() and length(trim(body)) between 1 and 3000);
create policy "users update own comments" on public.comments for update to authenticated
  using (user_id=auth.uid()) with check (user_id=auth.uid() and length(trim(body)) between 1 and 3000);
create policy "users delete own comments" on public.comments for delete to authenticated
  using (user_id=auth.uid());

drop policy if exists "comment likes" on public.comment_likes;
drop policy if exists "users manage own comment likes" on public.comment_likes;
create policy "users manage own comment likes" on public.comment_likes for all to authenticated
  using (user_id=auth.uid()) with check (user_id=auth.uid());

-- Public content only.
drop policy if exists "comments readable" on public.comments;
drop policy if exists "published comments readable" on public.comments;
create policy "published comments readable" on public.comments for select to anon,authenticated
  using (
    exists(select 1 from public.comics c where c.id=comments.comic_id and c.content_status='published')
    and (comments.episode_id is null or exists(
      select 1 from public.episodes e
      where e.id=comments.episode_id and e.comic_id=comments.comic_id and e.content_status='published'
    ))
  );

drop policy if exists "ratings readable" on public.ratings;
create policy "ratings readable on published comics" on public.ratings for select to anon,authenticated
  using (exists(select 1 from public.comics c where c.id=ratings.comic_id and c.content_status='published'));

drop policy if exists "reviews readable" on public.reviews;
create policy "reviews readable on published comics" on public.reviews for select to anon,authenticated
  using (exists(select 1 from public.comics c where c.id=reviews.comic_id and c.content_status='published'));

-- Protected admin visibility.
drop policy if exists "admin read all comics" on public.comics;
create policy "admin read all comics" on public.comics for select to authenticated using ((select private.is_admin()));
drop policy if exists "admin read all episodes" on public.episodes;
create policy "admin read all episodes" on public.episodes for select to authenticated using ((select private.is_admin()));
drop policy if exists "admin read all pages" on public.episode_pages;
create policy "admin read all pages" on public.episode_pages for select to authenticated using ((select private.is_admin()));

-- Publication helpers.
create or replace function public.publish_comic(p_comic_id uuid)
returns public.comics language plpgsql security definer set search_path=public,private as $$
declare v public.comics;
begin
  select * into v from public.comics where id=p_comic_id for update;
  if not found then raise exception 'Comic not found'; end if;
  if not ((v.created_by=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='creator' and p.creator_approved and not p.is_banned)) or private.is_admin()) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from public.episodes e where e.comic_id=p_comic_id and e.content_status='published') then raise exception 'Publish at least one episode first'; end if;
  update public.comics set content_status='published',published_at=coalesce(published_at,now()),updated_at=now() where id=p_comic_id returning * into v;
  return v;
end; $$;

create or replace function public.unpublish_comic(p_comic_id uuid)
returns public.comics language plpgsql security definer set search_path=public,private as $$
declare v public.comics;
begin
  select * into v from public.comics where id=p_comic_id for update;
  if not found then raise exception 'Comic not found'; end if;
  if not ((v.created_by=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='creator' and p.creator_approved and not p.is_banned)) or private.is_admin()) then raise exception 'Not authorized'; end if;
  update public.comics set content_status='draft',updated_at=now() where id=p_comic_id returning * into v;
  return v;
end; $$;

create or replace function public.publish_episode(p_episode_id uuid)
returns public.episodes language plpgsql security definer set search_path=public,private as $$
declare v public.episodes; n integer;
begin
  select * into v from public.episodes where id=p_episode_id for update;
  if not found then raise exception 'Episode not found'; end if;
  select count(*) into n from public.episode_pages where episode_id=p_episode_id;
  if n=0 then raise exception 'Episode needs at least one page'; end if;
  if not ((v.created_by=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='creator' and p.creator_approved and not p.is_banned)) or private.is_admin()) then raise exception 'Not authorized'; end if;
  update public.episodes set content_status='published',published_at=coalesce(published_at,now()),updated_at=now() where id=p_episode_id returning * into v;
  update public.comics c set chapters_count=(select count(*) from public.episodes e where e.comic_id=c.id and e.content_status='published'),last_episode_at=greatest(coalesce(c.last_episode_at,'epoch'::timestamptz),coalesce(v.published_at,now())),updated_at=now() where c.id=v.comic_id;
  return v;
end; $$;

create or replace function public.unpublish_episode(p_episode_id uuid)
returns public.episodes language plpgsql security definer set search_path=public,private as $$
declare v public.episodes;
begin
  select * into v from public.episodes where id=p_episode_id for update;
  if not found then raise exception 'Episode not found'; end if;
  if not ((v.created_by=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='creator' and p.creator_approved and not p.is_banned)) or private.is_admin()) then raise exception 'Not authorized'; end if;
  update public.episodes set content_status='draft',updated_at=now() where id=p_episode_id returning * into v;
  update public.comics c set chapters_count=(select count(*) from public.episodes e where e.comic_id=c.id and e.content_status='published'),updated_at=now() where c.id=v.comic_id;
  return v;
end; $$;

-- Admin-only mutation helpers prevent client privilege escalation.
create or replace function public.admin_set_creator_approval(p_user_id uuid,p_approved boolean)
returns public.profiles language plpgsql security definer set search_path=public,private as $$
declare v public.profiles;
begin
  if not private.is_admin() then raise exception 'Not authorized'; end if;
  update public.profiles set creator_approved=p_approved,updated_at=now() where id=p_user_id returning * into v;
  return v;
end; $$;

create or replace function public.admin_set_banned(p_user_id uuid,p_banned boolean)
returns public.profiles language plpgsql security definer set search_path=public,private as $$
declare v public.profiles;
begin
  if not private.is_admin() then raise exception 'Not authorized'; end if;
  update public.profiles set is_banned=p_banned,banned_until=null,updated_at=now() where id=p_user_id returning * into v;
  return v;
end; $$;

create or replace function public.admin_set_comic_moderation(p_comic_id uuid,p_content_status public.content_status)
returns public.comics language plpgsql security definer set search_path=public,private as $$
declare v public.comics;
begin
  if not private.is_admin() then raise exception 'Not authorized'; end if;
  update public.comics set content_status=p_content_status,updated_at=now() where id=p_comic_id returning * into v;
  return v;
end; $$;

create or replace function public.admin_feature_comic(p_comic_id uuid,p_featured boolean)
returns public.comics language plpgsql security definer set search_path=public,private as $$
declare v public.comics;
begin
  if not private.is_admin() then raise exception 'Not authorized'; end if;
  update public.comics set is_featured=p_featured,updated_at=now() where id=p_comic_id returning * into v;
  return v;
end; $$;

-- Recompute public engagement metrics and ranking signals from source tables.
create or replace function public.refresh_comic_metrics(p_comic_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare v_views bigint;v_followers bigint;v_bookmarks bigint;v_ratings integer;v_avg numeric;v_eps integer;v_recent bigint;
begin
  select count(*) into v_views from public.comic_views where comic_id=p_comic_id;
  select count(*) into v_followers from public.comic_follows where comic_id=p_comic_id;
  select count(*) into v_bookmarks from public.bookmarks where comic_id=p_comic_id;
  select count(*),coalesce(avg(rating),0) into v_ratings,v_avg from public.ratings where comic_id=p_comic_id;
  select count(*) into v_eps from public.episodes where comic_id=p_comic_id and content_status='published';
  select count(*) into v_recent from public.comic_views where comic_id=p_comic_id and viewed_at>=now()-interval '7 days';
  update public.comics set views=v_views,followers=v_followers,chapters_count=v_eps,average_rating=round(v_avg,2),rating_count=v_ratings,
    ranking_score=round((ln(1+v_views)*0.28)+(ln(1+v_followers)*0.30)+(v_avg*0.18)+(ln(1+v_bookmarks)*0.08)+(ln(1+v_eps)*0.05)+(ln(1+greatest(v_recent,0))*0.11),6),
    trending_score=round((ln(1+v_recent)*0.65)+(ln(1+v_followers)*0.15)+(ln(1+v_eps)*0.20),6),updated_at=now() where id=p_comic_id;
end; $$;

create or replace function public.sync_comic_metrics() returns trigger language plpgsql security definer set search_path=public as $$ begin perform public.refresh_comic_metrics(coalesce(new.comic_id,old.comic_id)); return coalesce(new,old); end; $$;
drop trigger if exists trg_metrics_view on public.comic_views;
create trigger trg_metrics_view after insert on public.comic_views for each row execute function public.sync_comic_metrics();
drop trigger if exists trg_metrics_follow on public.comic_follows;
create trigger trg_metrics_follow after insert or delete on public.comic_follows for each row execute function public.sync_comic_metrics();
drop trigger if exists trg_metrics_bookmark on public.bookmarks;
create trigger trg_metrics_bookmark after insert or delete on public.bookmarks for each row execute function public.sync_comic_metrics();
drop trigger if exists trg_metrics_rating on public.ratings;
create trigger trg_metrics_rating after insert or update or delete on public.ratings for each row execute function public.sync_comic_metrics();

-- Storage/content ownership controls.
drop policy if exists "creators delete pages" on public.episode_pages;
create policy "creators delete pages" on public.episode_pages for delete to authenticated using (exists(select 1 from public.episodes e where e.id=episode_pages.episode_id and e.created_by=auth.uid()));
drop policy if exists "creators delete episodes" on public.episodes;
create policy "creators delete episodes" on public.episodes for delete to authenticated using (created_by=auth.uid());
drop policy if exists "creators delete comics" on public.comics;
create policy "creators delete comics" on public.comics for delete to authenticated using (created_by=auth.uid());

revoke all on function public.publish_comic(uuid) from public,anon,authenticated;
revoke all on function public.unpublish_comic(uuid) from public,anon,authenticated;
revoke all on function public.publish_episode(uuid) from public,anon,authenticated;
revoke all on function public.unpublish_episode(uuid) from public,anon,authenticated;
revoke all on function public.admin_set_creator_approval(uuid,boolean) from public,anon,authenticated;
revoke all on function public.admin_set_banned(uuid,boolean) from public,anon,authenticated;
revoke all on function public.admin_set_comic_moderation(uuid,public.content_status) from public,anon,authenticated;
revoke all on function public.admin_feature_comic(uuid,boolean) from public,anon,authenticated;
revoke all on function public.refresh_comic_metrics(uuid) from public,anon,authenticated;
grant execute on function public.publish_comic(uuid) to authenticated;
grant execute on function public.unpublish_comic(uuid) to authenticated;
grant execute on function public.publish_episode(uuid) to authenticated;
grant execute on function public.unpublish_episode(uuid) to authenticated;
grant execute on function public.admin_set_creator_approval(uuid,boolean) to authenticated;
grant execute on function public.admin_set_banned(uuid,boolean) to authenticated;
grant execute on function public.admin_set_comic_moderation(uuid,public.content_status) to authenticated;
grant execute on function public.admin_feature_comic(uuid,boolean) to authenticated;
grant execute on function public.refresh_comic_metrics(uuid) to authenticated;
commit;
