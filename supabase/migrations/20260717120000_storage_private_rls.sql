-- Lock down the 'shramikfiles' bucket.
--
-- Background: the bucket was public and every object was keyed by the owner's
-- phone number (laborgovid/9876543210.jpg), so anyone who knew a phone number
-- could fetch that person's government ID with no authentication. The bucket is
-- now private; these policies decide who may mint a signed URL for what.
--
-- Signed URLs bypass RLS for their lifetime by design. RLS here gates who can
-- CREATE one, which is the control point that matters.

-- ── Drop the legacy blanket policies ─────────────────────────────────────
-- These have to go BEFORE the scoped ones below mean anything. Postgres ORs
-- permissive policies together, so leaving any of them in place makes every
-- policy in this file decorative.
--
--   public read shramikfiles    SELECT to {anon,authenticated}, whole bucket
--   public update shramikfiles  UPDATE to {anon,authenticated}, whole bucket
--   public upload shramikfiles  INSERT to {anon,authenticated}
--   anon_upload_shramikfiles    INSERT to {anon}
--
-- Turning the bucket private only closed /object/public/. `public read` still
-- let anyone holding the anon key — which ships in the web bundle by design —
-- mint a signed URL for any object via /object/sign/, government IDs included.
-- `public update` was worse: it allowed overwriting any object, so a forged
-- document could replace a real worker's ID at a guessable, phone-keyed path
-- before an admin ever saw it.
--
-- Nothing legitimate depends on these. Signup uploads are re-granted, narrowly,
-- below; the hirer ID upload goes through an edge function on the service role,
-- which bypasses RLS entirely and needs no policy at all.
drop policy if exists "public read shramikfiles" on storage.objects;
drop policy if exists "public update shramikfiles" on storage.objects;
drop policy if exists "public upload shramikfiles" on storage.objects;
drop policy if exists "anon_upload_shramikfiles" on storage.objects;

-- No UPDATE policy is recreated anywhere in this file. Uploads now use
-- upsert:false against UUID keys, so nothing needs to overwrite an object, and
-- the absence of the policy is what enforces that.

-- ── Admin check ──────────────────────────────────────────────────────────
-- SECURITY DEFINER so the lookup isn't itself subject to RLS on admin_users.
-- Inlining `exists (select 1 from admin_users ...)` into a policy works today
-- only because admin_users happens to let a user read their own row; tighten
-- that table later and government IDs would silently stop opening for admins.
-- Failing closed is right, but failing closed for a reason nobody can find is
-- not, so pin the dependency here.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.admin_users where id = auth.uid());
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ── Uploads ──────────────────────────────────────────────────────────────
-- Worker signup on the web is unauthenticated, so anon must be able to write
-- into the two labour prefixes. Insert-only: there is no UPDATE policy, so an
-- upload can never overwrite an existing object. Combined with UUID keys this
-- closes the old hole where uploading to laborgovid/<victim-phone>.jpg would
-- replace someone else's ID.
--
-- hireraadhaar/ is deliberately absent: those uploads go through the
-- upload-hirer-id edge function with the service role, which bypasses RLS.
drop policy if exists "shramikfiles: anon signup uploads" on storage.objects;
create policy "shramikfiles: anon signup uploads"
on storage.objects for insert
to anon, authenticated
with check (
  bucket_id = 'shramikfiles'
  and (storage.foldername(name))[1] in ('laborprofile', 'laborgovid')
);

-- ── Government IDs: admins only ──────────────────────────────────────────
-- Verification data. Never readable by hirers, never by other workers.
drop policy if exists "shramikfiles: gov ids admin read" on storage.objects;
create policy "shramikfiles: gov ids admin read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'shramikfiles'
  and (storage.foldername(name))[1] in ('laborgovid', 'hireraadhaar')
  and public.is_admin()
);

-- ── Profile photos: any signed-in user ───────────────────────────────────
-- Hirers need these to browse and rate workers; workers see their own.
drop policy if exists "shramikfiles: photos authed read" on storage.objects;
create policy "shramikfiles: photos authed read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'shramikfiles'
  and (storage.foldername(name))[1] = 'laborprofile'
);

-- ── Column semantics ─────────────────────────────────────────────────────
-- These three columns used to hold fully-qualified public URLs. They now hold
-- a storage path (e.g. 'laborgovid/3f9a2b7c-....jpg'); readers exchange it for
-- a short-lived signed URL at render time. The *_url names are kept for now to
-- avoid a rename landing in the middle of a security fix -- see TODO below.
comment on column public.labourers.photo_url is
  'Storage path in bucket shramikfiles (NOT a URL). Exchange via createSignedUrl.';
comment on column public.labourers.government_id_url is
  'Storage path in bucket shramikfiles (NOT a URL). Admin-readable only.';
comment on column public.hirers.aadhar_url is
  'Storage path in bucket shramikfiles (NOT a URL). Admin-readable only.';

-- TODO: rename these to photo_path / government_id_path / aadhar_path once the
-- schema baseline is in git (Phase 0) so the rename is a reviewable migration
-- rather than ad-hoc DDL against production.
