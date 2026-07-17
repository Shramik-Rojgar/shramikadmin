-- Turn on query statistics.
--
-- Without this there is no way to answer "which query is actually slow" except
-- by guessing. Supabase ships the extension but doesn't always enable it.
--
-- Cost: a shared-memory buffer (pg_stat_statements.max entries, 5000 by
-- default) and a small overhead per query. Negligible next to running blind.
create extension if not exists pg_stat_statements with schema extensions;
