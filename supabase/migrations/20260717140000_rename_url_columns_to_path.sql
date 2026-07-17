-- Rename the storage columns to say what they hold.
--
-- These were named *_url back when they held fully-qualified public URLs. Since
-- the bucket went private (20260717120000) they hold a bare storage path —
-- 'laborgovid/<uuid>.jpg' — which readers exchange for a short-lived signed URL.
-- A column called photo_url that must never be used as a URL is a trap for the
-- next person, and the cost of fixing it only goes up: today it's one migration
-- and four files, after the Flutter app ships it's an app release plus a
-- compatibility shim for every phone that hasn't updated.
--
-- Guarded so a re-run is a no-op: ALTER ... RENAME COLUMN has no IF EXISTS.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'labourers' and column_name = 'photo_url'
  ) then
    alter table public.labourers rename column photo_url to photo_path;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'labourers' and column_name = 'government_id_url'
  ) then
    alter table public.labourers rename column government_id_url to government_id_path;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'hirers' and column_name = 'aadhar_url'
  ) then
    alter table public.hirers rename column aadhar_url to aadhar_path;
  end if;
end $$;

-- Rows written before the private-bucket change still hold a full public URL,
-- and the re-key script hasn't been run — so for now these columns hold a mix
-- of paths (new rows) and legacy URLs (old rows). The readers cope: they unwrap
-- a public URL back to a path and sign that. The name describes what the column
-- is for, not what every historical row happens to contain.
comment on column public.labourers.photo_path is
  'Storage path in bucket shramikfiles. Exchange via createSignedUrl. Legacy rows may still hold a full public URL until scripts/rekey-storage.js runs.';
comment on column public.labourers.government_id_path is
  'Storage path in bucket shramikfiles. Admin-readable only. Legacy rows may still hold a full public URL.';
comment on column public.hirers.aadhar_path is
  'Storage path in bucket shramikfiles. Admin-readable only. Legacy rows may still hold a full public URL.';
