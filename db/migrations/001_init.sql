-- Anghkooey Slice 1 migration: identity + operational metadata only.
-- Walrus Mainnet holds durable personal-preference content. SQL never
-- stores long-term preference facts, only blob/job metadata and links.

create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  consent_at timestamptz
);

create table if not exists web_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_web_sessions_user on web_sessions(user_id);

create table if not exists channel_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  provider text not null check (provider in ('web','telegram','imessage')),
  provider_sender_id text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_sender_id)
);
create index if not exists idx_channel_user on channel_identities(user_id);

create table if not exists link_tokens (
  id uuid primary key default gen_random_uuid(),
  source_user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  pending_target text,
  confirmed_at timestamptz
);
create index if not exists idx_link_source on link_tokens(source_user_id);

create table if not exists conversation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  channel text not null check (channel in ('web','telegram','imessage')),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists idx_sessions_user on conversation_sessions(user_id);

create table if not exists recent_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references conversation_sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  text text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);
create index if not exists idx_recent_session on recent_messages(session_id, created_at);

create table if not exists memory_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  namespace text not null,
  job_id text not null unique,
  status text not null check (status in ('pending','running','uploaded','done','failed','unknown')),
  blob_id text,
  submitted_at timestamptz not null default now(),
  completed_at timestamptz,
  error_code text
);
create index if not exists idx_jobs_user on memory_jobs(user_id);
create index if not exists idx_jobs_blob on memory_jobs(blob_id);

create table if not exists memory_metadata (
  blob_id text primary key,
  user_id uuid not null references users(id) on delete cascade,
  memory_key text,
  category text,
  supersedes_blob_id text,
  state text not null default 'active' check (state in ('active','superseded','inactive')),
  created_at timestamptz not null default now()
);
create index if not exists idx_meta_user_key on memory_metadata(user_id, memory_key);

create table if not exists inbound_events (
  provider text not null,
  provider_event_id text not null,
  processed_at timestamptz not null default now(),
  status text not null default 'processed',
  primary key (provider, provider_event_id)
);
