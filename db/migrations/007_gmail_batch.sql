-- Slice Gmail-D: approved multi-hotel outreach. Batch snapshots are immutable
-- once written; codes are single-use hashes with a short TTL. Email bodies
-- stay AES-256-GCM ciphertext. Additive and reversible: drop the two
-- tables to roll back.

create table if not exists gmail_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  code_hash text unique,
  status text not null default 'pending'
    check (status in ('pending', 'consumed', 'cancelled')),
  mode text not null default 'test'
    check (mode in ('test', 'live')),
  shortlist_id uuid not null references hotel_shortlists(id) on delete restrict,
  destination text not null,
  check_in text not null,
  check_out text not null,
  expires_at timestamptz not null default now() + interval '30 minutes',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gmail_batches_user on gmail_batches(user_id);

create table if not exists gmail_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references gmail_batches(id) on delete cascade,
  position integer not null,
  hotel_name text not null,
  shortlist_item_id uuid references hotel_shortlist_items(id) on delete set null,
  contact_email text,
  contact_source_url text,
  enc_to text not null,
  enc_subject text not null,
  enc_body text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'unknown', 'cancelled')),
  gmail_message_id text,
  gmail_thread_id text,
  error_code text,
  send_attempted_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, position)
);
