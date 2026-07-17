# Load testing

Answers one question with data instead of opinion: **where does the current
read path actually fall over?**

## You need a staging project first

Create a second Supabase project (the free tier is fine — this measures query
shape, not hardware) and apply the schema to it:

```bash
supabase link --project-ref <staging-ref>
supabase db push
```

Every script here refuses to run against the production ref. That's a seatbelt,
not a substitute for reading the URL you paste.

## Run it

```bash
cd admin

# 1. Seed. Takes ~10 min for the default 100k workers / 50k jobs.
SUPABASE_URL=https://<staging-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<staging-service-key> \
node loadtest/seed.js

# 2. Load test the query the app makes today.
SUPABASE_URL=https://<staging-ref>.supabase.co \
SUPABASE_ANON_KEY=<staging-anon-key> \
k6 run loadtest/browse-jobs.js

# 3. Same test against a paginated, filtered query — the delta is the point.
SUPABASE_URL=... SUPABASE_ANON_KEY=... \
k6 run -e SCENARIO=paginated loadtest/browse-jobs.js

# 4. Clean up.
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node loadtest/teardown.js
```

## Scenarios

| `SCENARIO` | Query | Why |
|---|---|---|
| `current` (default) | `select=*&order=created_at.desc` | The OLD browse-jobs query — no filter, no limit. Baseline. |
| `provider` | adds `hirers(...)` join, `status=eq.active` | Verbatim `cache_provider.dart:57`. |
| `shipped` | `status=neq.ongoing` + `limit=20` | What browse-jobs ships now. The real before/after vs `current`. |
| `paginated` | explicit columns + bounding box + `limit=20` | The distance follow-up (PostGIS). Extra headroom over `shipped`. |

Run `current` then `shipped` back to back — that pair is the fix, measured.

## Reading the result

Latency is the least interesting number here. Postgres will serve 50k rows
without complaint — the problem was never the database.

Watch these instead:

- **`avg payload`** — bytes shipped to a phone per screen open. On Indian mobile
  data this is the user-facing cost, and it grows linearly with your jobs table.
- **`rows per request`** — should be ~20. If it tracks your row count, the query
  has no limit.
- **egress projection** in the summary — the Supabase bill, extrapolated.

A red threshold is the finding, not a broken test. The thresholds are set to
what you'd *want*, not what you'd currently pass.

## Interpreting it honestly

If `current` and `paginated` come back close together, the fix is less urgent
than assumed and this told you something useful. If `current` is shipping
megabytes per open while `paginated` ships kilobytes, that gap is your Phase 1
work, and you now have the number to justify it.

Either way you can answer the question this phase exists to answer: **what is
our actual ceiling, and how far are we from it?**
