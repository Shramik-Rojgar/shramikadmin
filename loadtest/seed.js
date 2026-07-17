#!/usr/bin/env node
/**
 * Seed a STAGING Supabase project with realistic volume for load testing.
 *
 * Default target: 100k labourers, 50k jobs. That's roughly where the current
 * query patterns are expected to fall over — not because Postgres struggles
 * with 50k rows (it doesn't), but because browse-jobs selects the entire table
 * with no limit and filters on the phone.
 *
 * !! NEVER POINT THIS AT PRODUCTION !!
 * It writes hundreds of thousands of junk rows. It refuses to run against the
 * known production ref as a backstop, but that check is a seatbelt, not a
 * substitute for reading the URL you just pasted.
 *
 * Usage:
 *   SUPABASE_URL=https://<staging-ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   node loadtest/seed.js [--workers 100000] [--jobs 50000]
 */
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const PRODUCTION_REF = 'kpkmrcieprtwnzjtftki';
const BATCH = 1000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : parseInt(process.argv[i + 1], 10);
}

const TARGET_WORKERS = arg('workers', 100_000);
const TARGET_JOBS = arg('jobs', 50_000);

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (staging project).');
  process.exit(1);
}

if (SUPABASE_URL.includes(PRODUCTION_REF)) {
  console.error(`SUPABASE_URL points at production (${PRODUCTION_REF}). Refusing.`);
  console.error('Create a separate staging project and point this at that.');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// A signed-in identity for k6 to borrow. `anon` has no SELECT grant on jobs
// (42501, not RLS), so an unauthenticated load test measures nothing but 401s.
// Workers normally sign in by phone OTP, which can't be automated — so this
// seeds an email/password user and links it to a labourer row instead.
// Staging-only by construction: the production guard above has already run.
const LOADTEST_EMAIL = process.env.LOADTEST_EMAIL || 'loadtest.worker@example.invalid';
const LOADTEST_PASSWORD = process.env.LOADTEST_PASSWORD || 'loadtest-only-not-a-real-secret';

// Real Indian cities with real coordinates: the browse-jobs distance filter is
// what we're testing, and uniformly random points would make every job either
// trivially in range or trivially out of it.
const CITIES = [
  { city: 'Gurugram', state: 'Haryana', lat: 28.4595, lng: 77.0266 },
  { city: 'Delhi', state: 'Delhi', lat: 28.6139, lng: 77.2090 },
  { city: 'Noida', state: 'Uttar Pradesh', lat: 28.5355, lng: 77.3910 },
  { city: 'Mumbai', state: 'Maharashtra', lat: 19.0760, lng: 72.8777 },
  { city: 'Pune', state: 'Maharashtra', lat: 18.5204, lng: 73.8567 },
  { city: 'Bengaluru', state: 'Karnataka', lat: 12.9716, lng: 77.5946 },
  { city: 'Hyderabad', state: 'Telangana', lat: 17.3850, lng: 78.4867 },
  { city: 'Chennai', state: 'Tamil Nadu', lat: 13.0827, lng: 80.2707 },
];

const SKILLS = ['Mason', 'Carpenter', 'Painter', 'Welder', 'Plumber',
  'Electrician', 'Bar bender', 'Tiler', 'Site helper', 'Labourer'];

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const jitter = (deg) => (Math.random() - 0.5) * deg; // ~±0.15deg ≈ ±16km

async function insertBatches(table, rows, label) {
  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error } = await db.from(table).insert(slice);
    if (error) {
      console.error(`\n  ! ${label} batch at ${i} failed: ${error.message}`);
      process.exit(1);
    }
    done += slice.length;
    process.stdout.write(`\r  ${label}: ${done.toLocaleString()} / ${rows.length.toLocaleString()}`);
  }
  process.stdout.write('\n');
}

console.log(`Seeding ${SUPABASE_URL}`);
console.log(`  ${TARGET_WORKERS.toLocaleString()} labourers, ${TARGET_JOBS.toLocaleString()} jobs\n`);

// ── Hirers ───────────────────────────────────────────────────────────────
// A few hundred is realistic: a marketplace has far more workers than posters,
// and jobs(hirers(...)) joins need something on the other side.
const HIRER_COUNT = 500;
const hirers = Array.from({ length: HIRER_COUNT }, (_, i) => {
  const c = pick(CITIES);
  return {
    id: randomUUID(),
    hirer_id: `LTHIR${String(i).padStart(6, '0')}`,
    first_name: 'Load', last_name: `Test${i}`,
    mobile_no: String(6000000000 + i),
    email: `loadtest.hirer.${i}@example.invalid`,
    entity_type: 'Individual',
    company_name: `Loadtest Co ${i}`,
    city: c.city, state: c.state,
    status: 'active', is_verified: true,
    completion_status: 'completed',
  };
});
await insertBatches('hirers', hirers, 'hirers');

// ── The k6 identity ──────────────────────────────────────────────────────
// Idempotent: a repeat seed reuses the existing user rather than erroring.
let loadtestAuthId = null;
{
  const { data, error } = await db.auth.admin.createUser({
    email: LOADTEST_EMAIL,
    password: LOADTEST_PASSWORD,
    email_confirm: true,
  });

  if (data?.user) {
    loadtestAuthId = data.user.id;
  } else if (error?.message?.toLowerCase().includes('already')) {
    const { data: list } = await db.auth.admin.listUsers();
    loadtestAuthId = list?.users?.find((u) => u.email === LOADTEST_EMAIL)?.id ?? null;
    if (loadtestAuthId) console.log('  reusing existing load-test user');
  }

  if (!loadtestAuthId) {
    console.error(`  ! could not create the load-test user: ${error?.message}`);
    process.exit(1);
  }
}

// ── Labourers ────────────────────────────────────────────────────────────
const workers = Array.from({ length: TARGET_WORKERS }, (_, i) => {
  const c = pick(CITIES);
  return {
    id: randomUUID(),
    // Worker 0 is the one k6 signs in as.
    auth_user_id: i === 0 ? loadtestAuthId : null,
    labour_id: `LTWRK${String(i).padStart(7, '0')}`,
    full_name: `Load Test Worker ${i}`,
    mobile_no: String(7000000000 + i),
    date_of_birth: '1990-01-01',
    gender: pick(['Male', 'Female']),
    skill_1: pick(SKILLS),
    skill_2: Math.random() > 0.5 ? pick(SKILLS) : null,
    experience_level: String(1 + Math.floor(Math.random() * 15)),
    daily_wage: 300 + Math.floor(Math.random() * 1200),
    city: c.city, state: c.state,
    status: 'approved',
  };
});
await insertBatches('labourers', workers, 'labourers');

// ── Jobs ─────────────────────────────────────────────────────────────────
// Mostly active: browse-jobs pulls every row regardless of status today, but a
// realistic mix keeps the numbers honest once a status filter lands.
const jobs = Array.from({ length: TARGET_JOBS }, (_, i) => {
  const c = pick(CITIES);
  const start = new Date(Date.now() + Math.floor(Math.random() * 30) * 86400000);
  return {
    id: randomUUID(),
    hirer_id: pick(hirers).id,
    title: `Load Test Job ${i}`,
    description: 'Seeded row for load testing. Safe to delete.',
    city: c.city, state: c.state,
    latitude: c.lat + jitter(0.3),
    longitude: c.lng + jitter(0.3),
    status: Math.random() > 0.25 ? 'active' : pick(['completed', 'cancelled']),
    work_start_date: start.toISOString().slice(0, 10),
    estimated_days: 1 + Math.floor(Math.random() * 10),
    created_at: new Date(Date.now() - Math.floor(Math.random() * 90) * 86400000).toISOString(),
  };
});
await insertBatches('jobs', jobs, 'jobs');

console.log(`\nSeeded.\n`);
console.log(`Load-test identity: ${LOADTEST_EMAIL}`);
console.log(`\nNow run:`);
console.log(`  SUPABASE_URL=${SUPABASE_URL} \\`);
console.log(`  SUPABASE_ANON_KEY=<staging-anon-key> \\`);
console.log(`  k6 run loadtest/browse-jobs.js`);
console.log(`\nTear down with:  node loadtest/teardown.js`);
