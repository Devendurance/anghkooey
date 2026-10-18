-- Slice Gmail-A: user-owned Gmail connection. Tokens stored only as
-- AES-256-GCM ciphertext; OAuth states are single-use with short TTL.
-- Additive and reversible: drop the two tables to roll back.

create table if not exists gmail_connections (
  user_id uuid primary key references users(id) on delete cascade,
  email text not null,
  enc_refresh_token text not null,
  enc_access_token text,
  access_expires_at timestamptz,
  scopes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists gmail_oauth_states (
  state_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  enc_verifier text not null,
  expires_at timestamptz not null default now() + interval '10 minutes',
  created_at timestamptz not null default now()
);
create index if not exists idx_gmail_states_user on gmail_oauth_states(user_id);
