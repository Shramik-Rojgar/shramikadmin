-- Lead tracking for the admin dashboard.
-- Admins can save a name and/or phone number, then mark the lead as contacted.

-- ── Leads table ──────────────────────────────────────────────────────────────
create table if not exists public.leads (
  id         uuid primary key default gen_random_uuid(),
  name       text,
  phone      text,
  status     text not null default 'uncontacted'
               check (status in ('uncontacted', 'contacted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_name_or_phone_required check (
    coalesce(trim(name), '') <> ''
    or coalesce(trim(phone), '') <> ''
  )
);

comment on table public.leads is 'Sales/support leads captured by admins.';
comment on column public.leads.name is 'Optional lead name; at least one of name or phone must be provided.';
comment on column public.leads.phone is 'Optional lead phone; at least one of name or phone must be provided.';
comment on column public.leads.status is 'uncontacted or contacted.';

-- ── RLS for leads ────────────────────────────────────────────────────────────
alter table public.leads enable row level security;

grant select, insert, update, delete on public.leads to authenticated;

drop policy if exists "leads: admin full access" on public.leads;
create policy "leads: admin full access"
  on public.leads for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── Indexes ──────────────────────────────────────────────────────────────────
create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_created_at_idx on public.leads (created_at desc);

-- ── Updated-at maintenance ───────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists leads_updated_at on public.leads;
create trigger leads_updated_at
  before update on public.leads
  for each row
  execute function public.set_updated_at();
