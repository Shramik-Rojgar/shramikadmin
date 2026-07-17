import http from 'k6/http';
import { check } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

/**
 * Load test for the browse-jobs read path.
 *
 * This fires the query the Flutter app actually makes today, verbatim:
 *
 *   worker_browse_jobs_screen.dart:167
 *     supabase.from('jobs').select().order('created_at', ascending: false)
 *
 * No filter. No limit. Every job in the table, to every device, on every open.
 * The point of this test is not to prove Postgres is slow — it isn't. It's to
 * put a number on the payload each worker's phone downloads, and to find where
 * that stops being survivable on Indian mobile data.
 *
 * Run:
 *   SUPABASE_URL=https://<staging>.supabase.co \
 *   SUPABASE_ANON_KEY=... \
 *   k6 run loadtest/browse-jobs.js
 *
 * Compare against the fixed version (keyset paginated, server-side filtered):
 *   k6 run -e SCENARIO=paginated loadtest/browse-jobs.js
 */

const SUPABASE_URL = __ENV.SUPABASE_URL;
const ANON_KEY = __ENV.SUPABASE_ANON_KEY;
const SCENARIO = __ENV.SCENARIO || 'current';

// Must match what seed.js created.
const LOADTEST_EMAIL = __ENV.LOADTEST_EMAIL || 'loadtest.worker@example.invalid';
const LOADTEST_PASSWORD = __ENV.LOADTEST_PASSWORD || 'loadtest-only-not-a-real-secret';

if (!SUPABASE_URL || !ANON_KEY) {
  throw new Error('Set SUPABASE_URL and SUPABASE_ANON_KEY (staging project).');
}

// The metric that matters. Latency is a symptom; bytes-to-device is the disease.
const payloadKb = new Trend('payload_kb');
const rowsReturned = new Trend('rows_returned');
const oversized = new Rate('payload_over_1mb');
const errors = new Counter('request_errors');

export const options = {
  // Ramp until it breaks rather than guessing a number. Each stage holds long
  // enough for the connection pool to reach steady state.
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 50 },
    { duration: '1m', target: 200 },
    { duration: '2m', target: 500 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    // Deliberately the targets you'd want, not the ones you'd pass. A red
    // threshold here is the finding, not a failure of the test.
    'http_req_duration{expected_response:true}': ['p(95)<500'],
    'http_req_failed': ['rate<0.01'],
    'payload_over_1mb': ['rate<0.01'],
  },
};

const QUERIES = {
  // The OLD query — whole table, every column, no limit. What browse-jobs did
  // before the fix. Kept as the baseline to measure against.
  current: '/rest/v1/jobs?select=*&order=created_at.desc',

  // What jobsListProvider does (cache_provider.dart:57) — adds the hirers join.
  provider: '/rest/v1/jobs?select=*,hirers(company_name,contact_name)&status=eq.active&order=created_at.desc',

  // What worker_browse_jobs_screen.dart SHIPS now: status filtered server-side,
  // one keyset page of _pageSize. This is the real before/after against
  // `current`. (Column set is still select() — trimming to explicit columns is
  // the follow-up once the jobs schema is in git.)
  shipped: '/rest/v1/jobs?select=*&status=neq.ongoing&order=created_at.desc&limit=20',

  // The aspiration: explicit columns + PostGIS-style distance filter (here a
  // bounding box around Gurugram) + keyset page. Where the distance follow-up
  // lands. Run this to see the additional headroom over `shipped`.
  paginated: '/rest/v1/jobs?select=id,title,city,latitude,longitude,wage_amount,created_at' +
    '&status=neq.ongoing' +
    '&latitude=gte.28.37&latitude=lte.28.55' +
    '&longitude=gte.76.93&longitude=lte.77.12' +
    '&order=created_at.desc&limit=20',
};

/**
 * Sign in once, share the token with every VU.
 *
 * The anon key alone gets 42501 "permission denied for table jobs" — anon has
 * no SELECT grant, the app reads jobs as a signed-in worker. Testing with the
 * anon key would measure a wall of 401s and tell you nothing.
 */
export function setup() {
  const res = http.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email: LOADTEST_EMAIL, password: LOADTEST_PASSWORD }),
    { headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' } },
  );

  const token = res.json('access_token');
  if (!token) {
    throw new Error(
      `Could not sign in as ${LOADTEST_EMAIL} (HTTP ${res.status}). ` +
      `Run loadtest/seed.js against this project first.`,
    );
  }
  return { token };
}

export default function (data) {
  const res = http.get(`${SUPABASE_URL}${QUERIES[SCENARIO]}`, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${data.token}`,
      // Ask PostgREST for the row count so we can record what a device receives.
      Prefer: 'count=exact',
    },
    tags: { scenario: SCENARIO },
  });

  const kb = res.body ? res.body.length / 1024 : 0;
  payloadKb.add(kb);
  oversized.add(kb > 1024);

  // content-range looks like "0-49999/50000"
  const range = res.headers['Content-Range'];
  if (range) {
    const total = parseInt(range.split('/')[1], 10);
    if (!isNaN(total)) rowsReturned.add(total);
  }

  const ok = check(res, {
    'status 200': (r) => r.status === 200,
    'payload under 1MB': () => kb < 1024,
  });
  if (!ok) errors.add(1);
}

export function handleSummary(data) {
  const p95 = data.metrics.http_req_duration?.values?.['p(95)'] ?? 0;
  const kb = data.metrics.payload_kb?.values?.avg ?? 0;
  const rows = data.metrics.rows_returned?.values?.avg ?? 0;
  const fail = (data.metrics.http_req_failed?.values?.rate ?? 0) * 100;

  const line = (s) => `  ${s}\n`;
  let out = `\n── browse-jobs (${SCENARIO}) ${'─'.repeat(30)}\n`;
  out += line(`p95 latency      ${p95.toFixed(0)} ms`);
  out += line(`avg payload      ${kb.toFixed(1)} KB per request`);
  out += line(`rows per request ${rows.toFixed(0)}`);
  out += line(`failed           ${fail.toFixed(2)} %`);
  out += '\n';

  // The number that reframes the argument: what this costs a real user.
  if (kb > 0) {
    const perOpenMb = kb / 1024;
    out += line(`Each screen open ships ${perOpenMb.toFixed(2)} MB to the device.`);
    out += line(`100k workers opening it 3x/day = ${(perOpenMb * 100000 * 3 / 1024).toFixed(0)} GB/day egress.`);
  }
  out += '\n';

  return { stdout: out };
}
