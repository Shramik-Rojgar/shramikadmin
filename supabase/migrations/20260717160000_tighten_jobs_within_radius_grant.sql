-- Tighten who can call jobs_within_radius.
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default, so the previous
-- migration's `grant ... to authenticated` didn't actually stop anon from
-- invoking it. It's harmless today — the function is SECURITY INVOKER and anon
-- has no SELECT on jobs, so an anon call errors with 42501 and returns no data —
-- but browse is an authenticated-only feature, so revoke the PUBLIC default and
-- leave only the explicit grant to authenticated.
revoke execute on function public.jobs_within_radius(
  double precision, double precision, double precision, timestamptz, text, integer
) from public;
