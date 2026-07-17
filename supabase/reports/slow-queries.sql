-- Slow-query reports. Paste into the Supabase SQL editor.
--
-- Deliberately not a view in `public`: PostgREST exposes that schema, and query
-- text is not something to hand out over an API.
--
-- Read these AFTER the app has taken real traffic for a few hours. Stats reset
-- on restart, and a report over ten minutes of your own clicking says nothing.


-- ── 1. What actually costs the most ──────────────────────────────────────
-- Sort by TOTAL time, not mean. A 5ms query run 200k times hurts more than a
-- 2s report someone runs at midnight, and only total time shows you that.
select
  round(total_exec_time::numeric, 1)          as total_ms,
  calls,
  round(mean_exec_time::numeric, 2)           as mean_ms,
  round((100 * total_exec_time / nullif(sum(total_exec_time) over (), 0))::numeric, 1) as pct_of_total,
  rows,
  left(regexp_replace(query, '\s+', ' ', 'g'), 120) as query
from extensions.pg_stat_statements
where query not like '%pg_stat_statements%'
order by total_exec_time desc
limit 25;


-- ── 2. Queries returning suspiciously many rows ──────────────────────────
-- This is the one to look at first. `select * from jobs` with no limit shows up
-- here as a huge rows/call, and that pattern is the known wall in this app:
-- browse-jobs pulls every job to the device and filters on the phone.
select
  round((rows::numeric / nullif(calls, 0)), 1) as avg_rows_per_call,
  calls,
  round(total_exec_time::numeric, 1)          as total_ms,
  left(regexp_replace(query, '\s+', ' ', 'g'), 120) as query
from extensions.pg_stat_statements
where calls > 5
  and query not like '%pg_stat_statements%'
order by (rows::numeric / nullif(calls, 0)) desc nulls last
limit 25;


-- ── 3. Sequential scans on big tables ────────────────────────────────────
-- A missing index shows up here long before it shows up in latency. If seq_scan
-- is high and idx_scan is near zero on `jobs` or `job_workers`, that's the fix.
select
  relname                                as table_name,
  n_live_tup                             as approx_rows,
  seq_scan,
  idx_scan,
  case when seq_scan + coalesce(idx_scan, 0) = 0 then null
       else round(100.0 * seq_scan / (seq_scan + coalesce(idx_scan, 0)), 1)
  end                                    as pct_seq
from pg_stat_user_tables
where n_live_tup > 100
order by seq_scan desc
limit 20;


-- ── 4. Indexes that exist but are never used ─────────────────────────────
-- Dead weight: slows every write, helps no read. Drop them.
select
  relname     as table_name,
  indexrelname as index_name,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
from pg_stat_user_indexes
where idx_scan = 0
  and indexrelname not like '%_pkey'
order by pg_relation_size(indexrelid) desc
limit 20;


-- ── 5. Table sizes — where you actually are ──────────────────────────────
-- The row counts you should be able to state from memory (Phase 0 exit).
select
  relname as table_name,
  n_live_tup as approx_rows,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size
from pg_stat_user_tables
order by n_live_tup desc
limit 20;


-- Reset the counters after a fix, to measure the change cleanly:
--   select extensions.pg_stat_statements_reset();
