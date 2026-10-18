-- Slice Gmail-C: approved single-email send. Draft contents are AES-256-GCM
-- ciphertext; approval codes are single-use hashes with a short TTL.
-- Additive and reversible: drop the table to roll back.

create table if not exists gmail_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  code_hash text not null unique,
  status text not null default 'pending'
    check (status in ('pending','sending','sent','failed','unknown','cancelled','superseded')),
  sender_email text not null,
  enc_to text not null,
  enc_subject text not null,
  enc_body text not null,
  expires_at timestamptz not null default now() + interval '30 minutes',
  gmail_message_id text,
  gmail_thread_id text,
  error_code text,
  send_attempted_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gmail_drafts_user on gmail_drafts(user_id);
