-- Board schema: visitor comments, who may sign in as admin, and the
-- singleton row of public/admin settings. Rate-limit counters live in a
-- separate table created at runtime by the app, not here.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- True when the caller's JWT has app_metadata.role = 'admin'.
-- Row-level security policies use this to gate admin reads and writes.
create or replace function public.is_admin()
returns boolean
language sql
stable
as $fn$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$fn$;

-- ---------------------------------------------------------------------------
-- comments + public view (email hidden from anon)
-- ---------------------------------------------------------------------------

-- One row per guestbook entry. Email and the admin "read" flag stay on this
-- table; the public board reads comments_public instead.
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,                          -- name shown on the board
  email text,                                          -- optional; omitted from the public view
  body text not null,                                  -- comment text
  is_read boolean not null default false,              -- admin unread badge; not public
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()        -- kept current by the trigger below
);

-- Newest-first listing for the public board and the admin list.
create index comments_created_at_idx on public.comments (created_at desc);

-- Trigger function: stamp updated_at whenever a comment row is updated
-- (admin edits, mark-read).
create or replace function public.set_comments_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

create trigger comments_set_updated_at
  before update on public.comments
  for each row
  execute function public.set_comments_updated_at();

-- Public projection of comments. Drops email and is_read so anonymous
-- visitors can list the board without seeing private columns.
create view public.comments_public as
  select id, display_name, body, created_at, updated_at
  from public.comments;

alter table public.comments enable row level security;

-- Anyone may submit a comment. The app still enforces length, rate limit,
-- and profanity before the insert.
create policy "anon_insert_comments"
  on public.comments
  for insert
  to anon
  with check (true);

-- Admins may read every column, including email and is_read.
create policy "admin_select_comments"
  on public.comments
  for select
  to authenticated
  using (public.is_admin());

-- Admins may insert, edit, and delete comments.
create policy "admin_insert_comments"
  on public.comments
  for insert
  to authenticated
  with check (public.is_admin());

create policy "admin_update_comments"
  on public.comments
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admin_delete_comments"
  on public.comments
  for delete
  to authenticated
  using (public.is_admin());

grant select on public.comments_public to anon, authenticated;
grant insert on public.comments to anon;
grant select, insert, update, delete on public.comments to authenticated;

-- ---------------------------------------------------------------------------
-- admin allowlist + Before User Created hook + promote trigger
-- ---------------------------------------------------------------------------

-- Emails allowed to become admins. Stored lowercase.
-- RLS is on and there are no policies, so anon and authenticated roles
-- cannot read or write this table. service_role (the CLI) and
-- supabase_auth_admin (the auth hook) are granted access below.
create table public.admin_allowlist (
  email text primary key,
  created_at timestamptz not null default now(),
  constraint admin_allowlist_email_lowercase check (email = lower(email))
);

alter table public.admin_allowlist enable row level security;
-- No policies: anon/authenticated cannot read or write.
-- service_role bypasses RLS but still needs table grants (auto-expose was off).
grant select, insert, update, delete on table public.admin_allowlist to service_role;

-- Supabase Auth "Before User Created" hook.
-- Rejects sign-up (403) unless the email is on admin_allowlist.
-- If it is, returns app_metadata.role = 'admin' so the new user's JWT
-- passes is_admin() checks.
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  user_email text;
begin
  user_email := lower(event->'user'->>'email');

  if user_email is null
     or user_email = ''
     or not exists (
       select 1 from public.admin_allowlist where email = user_email
     ) then
    return jsonb_build_object(
      'error',
      jsonb_build_object(
        'message', 'Not authorized',
        'http_code', 403
      )
    );
  end if;

  -- Stamp admin role into app_metadata for the new user (JWT + RLS).
  return jsonb_build_object(
    'user',
    jsonb_build_object(
      'app_metadata',
      jsonb_build_object('role', 'admin')
    )
  );
end;
$fn$;

grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from authenticated, anon, public;
grant usage on schema public to supabase_auth_admin;
grant select on table public.admin_allowlist to supabase_auth_admin;

-- Trigger function on auth.users insert.
-- If the new user's email is on the allowlist, merge role=admin into
-- raw_app_meta_data. Backup for the auth hook above: both paths stamp
-- the same claim.
create or replace function public.set_admin_role_from_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.email is not null
     and exists (
       select 1 from public.admin_allowlist where email = lower(new.email)
     ) then
    new.raw_app_meta_data :=
      coalesce(new.raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb;
  end if;
  return new;
end;
$fn$;

drop trigger if exists on_auth_user_created_set_admin on auth.users;
create trigger on_auth_user_created_set_admin
  before insert on auth.users
  for each row
  execute function public.set_admin_role_from_allowlist();

-- Called from the auth callback (ensure_admin_role RPC).
-- If the signed-in user is on the allowlist but their row is missing
-- app_metadata.role, write role=admin. The caller then refreshSession()
-- so the JWT picks up the claim and RLS checks succeed.
-- Returns false when there is no session or the email is not allowlisted.
create or replace function public.ensure_admin_role()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $fn$
declare
  uid uuid := auth.uid();
  user_email text;
begin
  if uid is null then
    return false;
  end if;

  select lower(email) into user_email from auth.users where id = uid;

  if user_email is null
     or not exists (
       select 1 from public.admin_allowlist where email = user_email
     ) then
    return false;
  end if;

  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
  where id = uid
    and coalesce(raw_app_meta_data->>'role', '') is distinct from 'admin';

  return true;
end;
$fn$;

revoke all on function public.ensure_admin_role() from public, anon;
grant execute on function public.ensure_admin_role() to authenticated;

-- ---------------------------------------------------------------------------
-- guestbook_settings (singleton id = 1)
-- ---------------------------------------------------------------------------

-- One row (id must be 1) of board copy, appearance, and moderation limits.
-- Anyone may read it. Only an admin JWT may update it.
create table public.guestbook_settings (
  id integer primary key check (id = 1),               -- singleton; always 1
  title text not null default '',                      -- board heading
  placeholder text not null default '',                -- comment-box placeholder
  marquee boolean not null default true,               -- scroll the heading
  capture_email boolean not null default true,         -- show the email field on the form
  main_font text not null default 'futura-pt',         -- body font key
  main_font_size text not null default 'regular',      -- smaller | regular | larger
  accent_font text not null default 'peony',           -- accent font key
  accent_font_size text not null default 'regular',    -- smaller | regular | larger
  page_size integer not null default 10,               -- comments per public page
  comment_length integer not null default 1000,        -- max characters per comment
  rate_limit_count integer not null default 1,         -- comments allowed per window
  rate_limit_minutes integer not null default 5,       -- length of that window, in minutes
  rate_limit_daily integer not null default 2,         -- comments allowed per day
  profanity_allow_list text not null default '',       -- words the filter should ignore
  custom_theme text not null default '',               -- optional theme override
  updated_at timestamptz not null default now()
);

insert into public.guestbook_settings (
  id,
  title,
  placeholder,
  marquee,
  capture_email,
  main_font,
  main_font_size,
  accent_font,
  accent_font_size,
  page_size,
  comment_length,
  rate_limit_count,
  rate_limit_minutes,
  rate_limit_daily,
  profanity_allow_list,
  custom_theme
) values (
  1,
  '',
  E'Sign the guestbook! Yes, just like it''s 2001.\nNo editing, no deleting, just thoughts into the void.\n\n(Please be kind.)',
  true,
  true,
  'futura-pt',
  'regular',
  'peony',
  'regular',
  10,
  1000,
  1,
  5,
  2,
  '',
  ''
);

alter table public.guestbook_settings enable row level security;

-- Public board and admin settings form both read this row.
create policy "anon_select_guestbook_settings"
  on public.guestbook_settings
  for select
  to anon, authenticated
  using (true);

-- Only an admin may change settings.
create policy "admin_update_guestbook_settings"
  on public.guestbook_settings
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.guestbook_settings to anon, authenticated;
grant update on public.guestbook_settings to authenticated;

-- Existing projects: no-op if comment_length is already present.
alter table public.guestbook_settings
  add column if not exists comment_length integer not null default 1000;
