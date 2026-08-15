-- Field executive support: admins create approved field executives who can log in
-- to /onboarding and register labourers on behalf of Shramik.

-- ── Field executives table (create first) ────────────────────────────────────
-- id is the Supabase Auth user id so the row doubles as the role/approval record.
create table if not exists public.field_executives (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null,
  email      text not null unique,
  phone      text,
  status     text not null default 'pending'
               check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login timestamptz
);

-- ── RLS for field_executives ────────────────────────────────────────────────
alter table public.field_executives enable row level security;

-- Expose the table to authenticated users so RLS policies can be evaluated.
grant select, update on public.field_executives to authenticated;

-- Field executives may read only their own row; admins may read all rows.
drop policy if exists "field_executives: own read or admin read" on public.field_executives;
create policy "field_executives: own read or admin read"
  on public.field_executives for select
  to authenticated
  using (
    id = auth.uid()
    or public.is_admin()
  );

-- Only admins can write to this table (service-role edge functions bypass RLS).
drop policy if exists "field_executives: admin write" on public.field_executives;
create policy "field_executives: admin write"
  on public.field_executives for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── Track which field executive registered a labourer ────────────────────────
alter table public.labourers
  add column if not exists registered_by uuid references public.field_executives(id) on delete set null;

create index if not exists labourers_registered_by_idx
  on public.labourers (registered_by);

-- ── Allow approved field executives to insert labourers ──────────────────────
-- These policies only take effect if RLS is enabled on public.labourers.
drop policy if exists "labourers: anon public signup insert" on public.labourers;
create policy "labourers: anon public signup insert"
  on public.labourers for insert
  to anon
  with check (registered_by is null);

drop policy if exists "labourers: field executive insert" on public.labourers;
create policy "labourers: field executive insert"
  on public.labourers for insert
  to authenticated
  with check (
    registered_by = auth.uid()
    and exists (
      select 1 from public.field_executives
      where id = auth.uid() and status = 'approved'
    )
  );
