-- WebComicWorld production backend
-- This migration adds the database-side primitives used by the web app.

create schema if not exists private;

-- Safe role helpers. These never trust a client-supplied role.
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.is_banned,false) = false
  );
$$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

create or replace function private.is_approved_creator()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('creator','admin')
      and coalesce(p.creator_approved,false) = true
      and coalesce(p.is_banned,false) = false
  );
$$;

revoke all on function private.is_approved_creator() from public;
grant execute on function private.is_approved_creator() to authenticated;

-- Reader-owned data policies.
alter table public.bookmarks enable row level security;
alter table public.comic_follows enable row level security;
alter table public.history enable row level security;
alter table public.reading_progress enable row level security;
alter table public.ratings enable row level security;
alter table public.reviews enable row level security;
alter table public.comments enable row level security;
alter table public.comment_likes enable row level security;

-- Drop only policies that this migration owns; existing unrelated policies survive.
drop policy if exists "users manage own bookmarks" on public.bookmarks;
drop policy if exists "users manage own follows" on public.comic_follows;
drop policy if exists "users manage own history" on public.history;
drop policy if exists "users manage own reading progress" on public.reading_progress;
drop policy if exists "users manage own ratings" on public.ratings;
drop policy if exists "users manage own reviews" on public.reviews;
drop policy if exists "authenticated create comments" on public.comments;
drop policy if exists "users manage own comments" on public.comments;
drop policy if exists "users manage own comment likes" on public.comment_likes;

create policy "users manage own bookmarks" on public.bookmarks
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "users manage own follows" on public.comic_follows
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "users manage own history" on public.history
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "users manage own reading progress" on public.reading_progress
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "users manage own ratings" on public.ratings
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "users manage own reviews" on public.reviews
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "authenticated create comments" on public.comments
for insert to authenticated
with check (user_id = auth.uid());

create policy "users manage own comments" on public.comments
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "users delete own comments" on public.comments
for delete to authenticated
using (user_id = auth.uid());

create policy "users manage own comment likes" on public.comment_likes
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Public content remains readable through normal SELECT policies where present.
-- Add safe creator/admin management policies for comics and episodes.
drop policy if exists "approved creators update own comics" on public.comics;
drop policy if exists "approved creators delete own comics" on public.comics;
drop policy if exists "approved creators update own episodes" on public.episodes;
drop policy if exists "approved creators delete own episodes" on public.episodes;
drop policy if exists "approved creators update own pages" on public.episode_pages;
drop policy if exists "approved creators delete own pages" on public.episode_pages;

create policy "approved creators update own comics" on public.comics
for update to authenticated
using (created_by = auth.uid() and private.is_approved_creator())
with check (created_by = auth.uid() and private.is_approved_creator());

create policy "approved creators delete own comics" on public.comics
for delete to authenticated
using (created_by = auth.uid() and private.is_approved_creator());

create policy "approved creators update own episodes" on public.episodes
for update to authenticated
using (
  created_by = auth.uid()
  and private.is_approved_creator()
  and exists (select 1 from public.comics c where c.id = episodes.comic_id and c.created_by = auth.uid())
)
with check (
  created_by = auth.uid()
  and private.is_approved_creator()
  and exists (select 1 from public.comics c where c.id = episodes.comic_id and c.created_by = auth.uid())
);

create policy "approved creators delete own episodes" on public.episodes
for delete to authenticated
using (
  created_by = auth.uid()
  and private.is_approved_creator()
  and exists (select 1 from public.comics c where c.id = episodes.comic_id and c.created_by = auth.uid())
);

create policy "approved creators update own pages" on public.episode_pages
for update to authenticated
using (
  exists (
    select 1 from public.episodes e
    join public.comics c on c.id = e.comic_id
    where e.id = episode_pages.episode_id
      and e.created_by = auth.uid()
      and c.created_by = auth.uid()
  ) and private.is_approved_creator()
)
with check (
  exists (
    select 1 from public.episodes e
    join public.comics c on c.id = e.comic_id
    where e.id = episode_pages.episode_id
      and e.created_by = auth.uid()
      and c.created_by = auth.uid()
  ) and private.is_approved_creator()
);

create policy "approved creators delete own pages" on public.episode_pages
for delete to authenticated
using (
  exists (
    select 1 from public.episodes e
    join public.comics c on c.id = e.comic_id
    where e.id = episode_pages.episode_id
      and e.created_by = auth.uid()
      and c.created_by = auth.uid()
  ) and private.is_approved_creator()
);

-- Admin moderation.
drop policy if exists "admins manage comics" on public.comics;
drop policy if exists "admins manage episodes" on public.episodes;
drop policy if exists "admins manage reports" on public.reports;

create policy "admins manage comics" on public.comics
for all to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy "admins manage episodes" on public.episodes
for all to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy "admins manage reports" on public.reports
for all to authenticated
using (private.is_admin())
with check (private.is_admin());

-- Useful indexes for the production reader and creator studio.
create index if not exists bookmarks_user_comic_idx on public.bookmarks(user_id, comic_id);
create index if not exists follows_user_comic_idx on public.comic_follows(user_id, comic_id);
create index if not exists ratings_comic_idx on public.ratings(comic_id);
create index if not exists reviews_comic_created_idx on public.reviews(comic_id, created_at desc);
create index if not exists comments_comic_created_idx on public.comments(comic_id, created_at desc);
create index if not exists comment_likes_comment_idx on public.comment_likes(comment_id);

-- Keep rating aggregates synchronized when ratings change.
create or replace function public.recalculate_comic_rating()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_comic uuid;
  avg_rating numeric;
begin
  target_comic := coalesce(new.comic_id, old.comic_id);
  select coalesce(avg(rating),0) into avg_rating
  from public.ratings where comic_id = target_comic;
  update public.comics
  set average_rating = round(avg_rating,2)
  where id = target_comic;
  return coalesce(new,old);
end;
$$;

drop trigger if exists trg_recalculate_comic_rating on public.ratings;
create trigger trg_recalculate_comic_rating
after insert or update or delete on public.ratings
for each row execute function public.recalculate_comic_rating();

-- Lightweight ranking score based on durable engagement signals.
create or replace function public.refresh_comic_ranking(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.comics c
  set ranking_score = (
      coalesce(c.views,0) * 0.20
      + coalesce(c.followers,0) * 0.35
      + coalesce(c.average_rating,0) * 100 * 0.30
      + case when c.last_chapter_at is not null and c.last_chapter_at > now() - interval '30 days' then 150 else 0 end
    ),
    trending_score = (
      case when c.last_chapter_at is not null then greatest(0, 30 - extract(epoch from (now()-c.last_chapter_at))/86400) * 20 else 0 end
      + coalesce(c.followers,0) * 0.10
      + coalesce(c.views,0) * 0.02
    )
  where c.id = target_id;
end;
$$;

revoke all on function public.refresh_comic_ranking(uuid) from public;
grant execute on function public.refresh_comic_ranking(uuid) to authenticated;
