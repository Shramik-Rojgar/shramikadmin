-- Allow any authenticated admin-console user (not just full admins) to manage leads.
-- The admin dashboard already gates page access by role, but leads should be usable
-- by verification officers and finance admins as well.

alter table public.leads enable row level security;

-- Drop the overly restrictive full-admin-only policy.
drop policy if exists "leads: admin full access" on public.leads;

-- Any authenticated user who has a row in admin_users may read/write leads.
drop policy if exists "leads: admin user access" on public.leads;
create policy "leads: admin user access"
  on public.leads for all
  to authenticated
  using (exists (select 1 from public.admin_users where id = auth.uid()))
  with check (exists (select 1 from public.admin_users where id = auth.uid()));
