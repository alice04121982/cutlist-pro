-- Cutter waiting list for api/cutter-waitlist.js. Run once in the Supabase SQL editor.
-- Row level security is on with no policies, so the publishable (anon) key can neither read nor write.
-- Only the serverless function, using the secret key, can insert. Read the list in the Supabase dashboard.

create table if not exists public.cutter_waitlist (
  id bigint generated always as identity primary key,
  email text not null unique check (char_length(email) <= 254 and email = lower(email)),
  area text check (area ~ '^[A-Z]{1,2}$'),
  template text check (char_length(template) <= 20),
  consent_version text not null check (char_length(consent_version) <= 20),
  created_at timestamptz not null default now()
);

alter table public.cutter_waitlist enable row level security;
revoke all on table public.cutter_waitlist from anon, authenticated;

-- Retention: the privacy notice promises deletion after 12 months if no cutter has been arranged.
-- Run this by hand (or on a schedule) to keep that promise:
-- delete from public.cutter_waitlist where created_at < now() - interval '12 months';
