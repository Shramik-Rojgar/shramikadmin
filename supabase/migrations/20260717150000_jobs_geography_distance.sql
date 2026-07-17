-- Server-side distance filtering for browse-jobs.
--
-- Until now the worker app pulled jobs and filtered by distance on the device,
-- which meant every phone downloaded every job's coordinates. This adds a
-- geography column + GiST index so the database can filter by radius, and an
-- RPC the app calls instead of selecting the table.
--
-- PostGIS lives in the `extensions` schema on Supabase; put it on the search
-- path for this migration so the geography type, gist opclass and ST_* funcs
-- resolve unqualified. The persistent functions below pin their own search_path.
set local search_path = public, extensions;

create extension if not exists postgis with schema extensions;

-- ── The column ───────────────────────────────────────────────────────────
alter table public.jobs
  add column if not exists location geography(Point, 4326);

-- ── Keep it in sync with latitude/longitude ──────────────────────────────
-- latitude/longitude may be stored as numeric or as text, and either may be an
-- empty string on partially-filled rows; btrim/nullif guards both so a bad
-- value yields NULL location rather than erroring the write.
create or replace function public.jobs_sync_location()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if nullif(btrim(new.latitude::text), '') is not null
     and nullif(btrim(new.longitude::text), '') is not null then
    new.location := ST_SetSRID(
      ST_MakePoint(new.longitude::double precision, new.latitude::double precision),
      4326
    )::geography;
  else
    new.location := null;
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_sync_location_trg on public.jobs;
create trigger jobs_sync_location_trg
  before insert or update of latitude, longitude on public.jobs
  for each row execute function public.jobs_sync_location();

-- ── Backfill existing rows ───────────────────────────────────────────────
update public.jobs
set location = ST_SetSRID(
  ST_MakePoint(longitude::double precision, latitude::double precision),
  4326
)::geography
where location is null
  and nullif(btrim(latitude::text), '') is not null
  and nullif(btrim(longitude::text), '') is not null;

-- ── The index ────────────────────────────────────────────────────────────
create index if not exists jobs_location_gist on public.jobs using gist (location);

-- ── The RPC the app calls ────────────────────────────────────────────────
-- Does server-side what browse-jobs used to do half on the device: status
-- filter, optional radius, optional text search, keyset page on created_at.
-- SECURITY INVOKER (default) so the caller's RLS/grants on jobs still apply.
--
-- NULL-coordinate jobs are returned regardless of radius, matching the old
-- client behaviour (its distance check kept jobs whose coordinates were
-- unknown). When p_lat/p_lng/p_radius_m is NULL — worker location unavailable —
-- the distance filter is skipped entirely, again as before.
create or replace function public.jobs_within_radius(
  p_lat      double precision default null,
  p_lng      double precision default null,
  p_radius_m double precision default null,
  p_cursor   timestamptz      default null,
  p_search   text             default null,
  p_limit    integer          default 20
)
returns setof public.jobs
language sql
stable
set search_path = public, extensions
as $$
  select j.*
  from public.jobs j
  where j.status <> 'ongoing'
    and (p_cursor is null or j.created_at < p_cursor)
    and (
      p_lat is null or p_lng is null or p_radius_m is null
      or j.location is null
      or ST_DWithin(
           j.location,
           ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
           p_radius_m
         )
    )
    and (
      p_search is null or p_search = ''
      or j.title    ilike '%' || p_search || '%'
      or j.category ilike '%' || p_search || '%'
      or j.city     ilike '%' || p_search || '%'
    )
  order by j.created_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

grant execute on function public.jobs_within_radius(
  double precision, double precision, double precision, timestamptz, text, integer
) to authenticated;
