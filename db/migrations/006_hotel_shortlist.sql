-- Slice Hotels: durable user-owned hotel shortlist plus contact verification.
-- Only genuinely returned candidate fields are stored. Additive and
-- reversible: drop the two tables to roll back.

create table if not exists hotel_shortlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  destination text not null,
  check_in text not null,
  check_out text not null,
  status text not null default 'active'
    check (status in ('active', 'stale')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_hotel_shortlists_user on hotel_shortlists(user_id);

create table if not exists hotel_shortlist_items (
  id uuid primary key default gen_random_uuid(),
  shortlist_id uuid not null references hotel_shortlists(id) on delete cascade,
  position integer not null check (position between 1 and 3),
  name text not null,
  address text,
  source text not null,
  source_url text not null,
  rate_amount numeric,
  rate_currency text,
  observed_at timestamptz not null default now(),
  contact_email text,
  contact_source_url text,
  contact_status text not null default 'unverified'
    check (contact_status in ('unverified', 'verified', 'contact_not_found', 'user_provided_unverified')),
  contact_verified_at timestamptz,
  contact_note text,
  unique (shortlist_id, position)
);
