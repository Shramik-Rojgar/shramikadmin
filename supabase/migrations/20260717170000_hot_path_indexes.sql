-- Indexes for the hot read paths, from the query patterns in the apps.
--
-- Created non-concurrently: these tables are tiny today (tens to low hundreds of
-- rows), so the build is instant and the brief lock is a non-issue — and it's
-- the right moment, since building an index on an empty table costs nothing.
-- When a table is large, add future indexes with CREATE INDEX CONCURRENTLY
-- (which cannot run inside a migration transaction) instead.

-- browse-jobs / jobs_within_radius: status filter + created_at DESC ordering.
create index if not exists jobs_status_created_at_idx
  on public.jobs (status, created_at desc);

-- hirer's own jobs (hirerJobsProvider, Home/My Jobs), newest first.
create index if not exists jobs_hirer_created_at_idx
  on public.jobs (hirer_id, created_at desc);

-- Distance filter — already created in 20260717150000; here for completeness,
-- a no-op if it exists.
create index if not exists jobs_location_gist
  on public.jobs using gist (location);

-- Worker's assignments: browse hides date-clashing/active commitments, and
-- other screens filter these by status too.
create index if not exists job_workers_labourer_status_idx
  on public.job_workers (labourer_id, status);

-- Worker's applications: browse pulls applied job_ids by labourer.
create index if not exists job_applications_labourer_idx
  on public.job_applications (labourer_id);

-- Worker profile lookup by auth user. FK columns are NOT auto-indexed by
-- Postgres, so this one is genuinely new.
create index if not exists labourers_auth_user_id_idx
  on public.labourers (auth_user_id);

-- Worker profile lookup by phone. mobile_no already has a UNIQUE constraint
-- (signup relies on 23505 unique_violation), and that constraint carries its
-- own index — so only add one if nothing already covers the column, rather than
-- duplicating it and taxing every write.
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'labourers'
      and indexdef ilike '%(mobile_no%'
  ) then
    create index labourers_mobile_no_idx on public.labourers (mobile_no);
  end if;
end $$;
