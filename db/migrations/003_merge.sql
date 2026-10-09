-- Slice 4: existing-account consolidation via namespace aliasing.
-- Walrus blobs stay under their original per-user namespaces; merges only
-- add alias rows so recall fans out. No memory content moves, nothing deleted.

create table if not exists user_merges (
  merged_user_id uuid primary key references users(id) on delete restrict,
  canonical_user_id uuid not null references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  reason text not null default 'owner-approved channel consolidation'
);
create index if not exists idx_merges_canonical on user_merges(canonical_user_id);

-- Two-step claim approvals. provider_sender_id mirrors channel_identities
-- (verified Photon event only, never browser JSON). Code hashes only.
create table if not exists merge_requests (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null,
  web_user_id uuid not null references users(id) on delete cascade,
  channel_user_id uuid not null references users(id) on delete cascade,
  provider text not null check (provider in ('telegram','imessage')),
  provider_sender_id text not null,
  source_memories integer not null default 0,
  target_memories integer not null default 0,
  expires_at timestamptz not null default now() + interval '15 minutes',
  used_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (code_hash)
);
create index if not exists idx_merge_req_sender on merge_requests(provider, provider_sender_id);
