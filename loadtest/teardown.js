#!/usr/bin/env node
/**
 * Delete everything seed.js created. Matches on the load-test ID prefixes only,
 * so it cannot touch a real row even if pointed somewhere unexpected.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node loadtest/teardown.js
 */
import { createClient } from '@supabase/supabase-js';

const PRODUCTION_REF = 'kpkmrcieprtwnzjtftki';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (staging project).');
  process.exit(1);
}

if (SUPABASE_URL.includes(PRODUCTION_REF)) {
  console.error(`SUPABASE_URL points at production (${PRODUCTION_REF}). Refusing.`);
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Jobs first: they reference hirers.
const steps = [
  { table: 'jobs', column: 'title', pattern: 'Load Test Job %' },
  { table: 'labourers', column: 'labour_id', pattern: 'LTWRK%' },
  { table: 'hirers', column: 'hirer_id', pattern: 'LTHIR%' },
];

for (const { table, column, pattern } of steps) {
  const { error, count } = await db
    .from(table)
    .delete({ count: 'exact' })
    .like(column, pattern);

  if (error) {
    console.error(`  ! ${table}: ${error.message}`);
    process.exit(1);
  }
  console.log(`  ${table}: deleted ${count ?? 0}`);
}

console.log('\nTeardown complete.');
