# Database connection policy

**Rule: nothing connects directly to Postgres except through the Supavisor
transaction-mode pooler.** This is the gate before any horizontal scaling —
every backend instance holding its own direct pool multiplies connection
pressure, and Postgres tops out in the low hundreds of connections.

## Current state (audited 2026-07-17)

No component holds a direct Postgres connection today. Flutter, web, admin,
edge functions, and the seed/rekey/loadtest scripts all speak HTTP to
PostgREST / GoTrue / Storage; PostgREST manages the only server-side pool.
That is why this file is policy, not migration — it exists so the **first**
direct consumer (NestJS/Prisma, a queue worker, a cron script) is born on the
right connection string instead of being fixed later under load.

## The three connection strings

Same host, different semantics. Host: `aws-1-ap-southeast-1.pooler.supabase.com`
(user `postgres.kpkmrcieprtwnzjtftki`; password in the dashboard, never in git).

| Use case | Port / mode | Why |
|---|---|---|
| **Application runtime** (NestJS, workers, any horizontally-scaled service) | **6543 — transaction mode** | Connections are shared per-transaction, so N app instances don't hold N×pool_size server connections. The only mode that survives horizontal scaling. |
| **Migrations / long-lived tooling** (`prisma migrate`, `supabase db push`) | 5432 — session mode | DDL and advisory locks need session state that transaction mode deliberately drops. |
| Direct (`db.<ref>.supabase.co:5432`) | avoid | Bypasses pooling entirely; emergencies and dashboard SQL editor only. |

## Transaction-mode constraints (why code must be written for it)

Transaction mode hands your connection to another client between transactions,
so anything relying on **session state breaks silently**:

- **No prepared statements** — Prisma needs `?pgbouncer=true`; node-postgres
  needs named prepared statements off.
- No `SET`/`SET LOCAL` outside a transaction, no session-level advisory locks,
  no `LISTEN/NOTIFY`, no temp tables across transactions.
- `search_path` assumptions must be per-query, not per-connection.

## Prisma config for the future NestJS backend (copy-paste)

```env
# runtime — transaction pooler, prepared statements off
DATABASE_URL="postgresql://postgres.kpkmrcieprtwnzjtftki:<PW>@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=10"
# migrations — session pooler
DIRECT_URL="postgresql://postgres.kpkmrcieprtwnzjtftki:<PW>@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres"
```

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

Size `connection_limit` as: (pooler default_pool_size) / (max app instances),
not per-instance appetite. 10 per instance is a sane start; revisit with data.

## Local dev parity

`config.toml` runs the local pooler in **transaction mode** (port 54329,
`enabled = true`) so session-state bugs surface on a laptop, not during a
scale event. Point local backend/scripts at 54329, not 54322 (direct).

## Read replica for the admin dashboard (analytics isolation)

**Why:** the admin `Dashboard` and `Analytics` pages pull whole tables
(`select('*')` over labourers/hirers/jobs/payments/attendance) and aggregate in
JS. On the shared primary, one admin loading Analytics competes for CPU with
every worker's Browse Jobs. A read replica moves that heavy read traffic off the
primary so analytics can't slow the app.

**Code seam (already in place):** `src/lib/supabase.js` exports `supabaseRead`.
With no replica configured it *is* the primary client (no-op). Analytics.jsx and
Dashboard.jsx already read through it; write/management pages stay on `supabase`.

**To turn it on (paid, dashboard):**
1. Dashboard → Settings → Infrastructure → **Read Replicas** → add one in the
   same region (ap-southeast-1). Requires a paid compute tier.
2. Copy the replica's (or load balancer's) **Data API URL**.
3. Set `VITE_SUPABASE_REPLICA_URL=<that url>` in admin/.env (and in Vercel env),
   redeploy. Same anon key. Done — no code change.

**Do NOT route through the replica:**
- Anything that writes then re-reads (settlements, approve/reject) — replicas lag
  the primary by up to a few seconds, so you'd read stale data (read-your-writes).
- Currently only Analytics + Dashboard are routed; both are pure reads.

**When it's worth it:** not now (0 jobs — the primary is idle). Provision when
Analytics load times climb or the primary's CPU shows contention during admin
use. The seam exists so that day is an env var, not a refactor.

## Dashboard settings to verify (needs login — cannot be done from CLI)

Dashboard → Project Settings → Database → Connection pooling:
- Transaction-mode pool size: default is fine at current scale; raise it before
  the first backend ships, alongside the compute tier.
- RLS note: connections via pooler authenticate as `postgres.<ref>` — RLS does
  NOT apply to this role. A future backend re-implements authorization in code
  (this was flagged in the NestJS plan: Prisma bypasses RLS and fails open).
