-- Slice 2: sessions hardening, rate limiting.
-- Additive only. Preserves Slice 1 tables and data.

-- Explicit revocation + last-seen for browser sessions.
alter table web_sessions
  add column if not exists revoked_at timestamptz,
  add column if not exists last_seen_at timestamptz not null default now();

-- DB-backed rate limiting buckets (fixed window).
create table if not exists rate_limits (
  bucket_key text primary key,
  count integer not null default 1,
  window_start timestamptz not null default now()
);
