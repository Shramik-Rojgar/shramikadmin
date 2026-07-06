-- Run this once in the Supabase SQL editor to enable the Admin Logs page.

create table public.admin_activity_logs (
  id uuid not null default gen_random_uuid(),
  admin_id uuid null references public.admin_users(id) on delete set null,
  admin_email text null,
  admin_name text null,
  action text not null,
  entity_type text null,
  entity_id text null,
  description text not null,
  metadata jsonb null,
  created_at timestamp with time zone not null default now(),
  constraint admin_activity_logs_pkey primary key (id)
);

create index idx_admin_activity_logs_created_at on public.admin_activity_logs using btree (created_at desc);
create index idx_admin_activity_logs_admin_id   on public.admin_activity_logs using btree (admin_id);

alter table public.admin_activity_logs enable row level security;

-- Any authenticated admin can read the full audit trail.
create policy "Admins can view activity logs"
  on public.admin_activity_logs for select
  to authenticated
  using (true);

-- Any authenticated admin can write a log entry (used by logActivity()).
create policy "Admins can insert activity logs"
  on public.admin_activity_logs for insert
  to authenticated
  with check (true);

-- RLS policies only govern *which rows* a role can see — the role still
-- needs a base table-level grant, which the SQL editor doesn't add
-- automatically (unlike the dashboard's Table Editor).
grant select, insert on public.admin_activity_logs to authenticated;
