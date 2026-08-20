-- The admin dashboard already handles access control at the page level.
-- Allow any authenticated user to manage leads so the feature works for all
-- logged-in admin console accounts (including those without an admin_users row).

alter table public.leads enable row level security;

drop policy if exists "leads: admin full access" on public.leads;
drop policy if exists "leads: admin user access" on public.leads;

drop policy if exists "leads: authenticated full access" on public.leads;
create policy "leads: authenticated full access"
  on public.leads for all
  to authenticated
  using (true)
  with check (true);
