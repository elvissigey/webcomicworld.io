# WebComicWorld Supabase backend

This directory contains the database migration layer used by WebComicWorld.

The connected Supabase project contains the application schema, RLS policies, Storage policies, publication helpers, moderation helpers, engagement metrics and ranking logic.

## Production rules

- The frontend uses only the Supabase anon/public key.
- Service-role credentials must never be placed in Vite environment variables or browser code.
- Creator publishing is performed through guarded SQL functions.
- Admin creator approval, bans, comic moderation and featuring are performed through guarded SQL functions.
- Reader engagement tables are scoped to `auth.uid()` through RLS.
- Public readers can only see published comic content and published discussion attached to it.
- Creator uploads are rooted under the authenticated user's UUID and are checked by Storage RLS.
- Draft and unpublished rows are not part of public catalogue queries.

## Applying migrations

The migrations are timestamped so they can be tracked by Supabase CLI in a normal deployment workflow. The connected project has already received the production feature migrations through the Supabase integration used for this project.
