-- Slice Hotels contact recovery: retain how each contact was found.
-- Additive only; existing rows keep working (new columns stay null).

alter table if exists hotel_shortlist_items
  add column if not exists contact_method text,
  add column if not exists contact_kind text,
  add column if not exists contact_phone text,
  add column if not exists contact_form_url text,
  add column if not exists contact_messaging_url text;
