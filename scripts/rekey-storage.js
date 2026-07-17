#!/usr/bin/env node
/**
 * Re-key storage objects off phone numbers and onto random UUIDs.
 *
 * Why: every object in the 'shramikfiles' bucket was named after its owner's
 * phone number (laborgovid/9876543210.jpg). The bucket was public, so anyone
 * who knew a phone number could fetch that person's government ID. The bucket
 * is private now, but the keys are still guessable — this script removes the
 * phone numbers from the paths and rewrites the DB columns to match.
 *
 * The *_url columns hold a fully-qualified public URL for rows written before
 * the fix, and a bare storage path after it. That difference is how this script
 * decides what still needs migrating, which makes it safe to re-run.
 *
 * Per object: copy to the new key, point the DB at it, then delete the old one.
 * In that order — an interruption leaves either a harmless orphan copy or a
 * stale-but-working row, never a row pointing at a file that isn't there.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/rekey-storage.js          # dry run
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/rekey-storage.js --apply  # for real
 */
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const BUCKET = 'shramikfiles';
const APPLY = process.argv.includes('--apply');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Find them in Dashboard → Project Settings → API. The service');
  console.error('role key bypasses RLS — never commit it, never ship it to a client.');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const TARGETS = [
  { table: 'labourers', column: 'photo_url', folder: 'laborprofile' },
  { table: 'labourers', column: 'government_id_url', folder: 'laborgovid' },
  { table: 'hirers', column: 'aadhar_url', folder: 'hireraadhaar' },
];

/**
 * Pull the storage path out of a legacy public URL.
 * 'https://x.supabase.co/storage/v1/object/public/shramikfiles/laborgovid/98x.jpg'
 *   -> 'laborgovid/98x.jpg'
 * Returns null if the URL doesn't point into our bucket.
 */
function pathFromPublicUrl(url) {
  const marker = `/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const path = decodeURIComponent(url.slice(i + marker.length)).split('?')[0];
  return path || null;
}

function extOf(path) {
  const ext = path.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  return ext || 'jpg';
}

async function migrateTarget({ table, column, folder }) {
  const { data: rows, error } = await db
    .from(table)
    .select(`id, ${column}`)
    .not(column, 'is', null);

  if (error) {
    console.error(`  ! could not read ${table}.${column}: ${error.message}`);
    return { migrated: 0, skipped: 0, failed: 1 };
  }

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    const value = String(row[column] ?? '');
    if (!value) { skipped++; continue; }

    // Already a bare path -> migrated on an earlier run.
    if (!value.startsWith('http')) { skipped++; continue; }

    const oldPath = pathFromPublicUrl(value);
    if (!oldPath) {
      console.warn(`  ? ${table}#${row.id}: ${column} is a URL outside ${BUCKET}, leaving alone`);
      skipped++;
      continue;
    }

    const newPath = `${folder}/${randomUUID()}.${extOf(oldPath)}`;

    if (!APPLY) {
      console.log(`  · ${table}#${row.id}: ${oldPath} -> ${newPath}`);
      migrated++;
      continue;
    }

    // 1. Copy. If the object is gone, the row is already broken — say so and
    //    move on rather than pointing it at a key that holds nothing.
    const { error: copyErr } = await db.storage.from(BUCKET).copy(oldPath, newPath);
    if (copyErr) {
      console.error(`  ! ${table}#${row.id}: copy ${oldPath} failed: ${copyErr.message}`);
      failed++;
      continue;
    }

    // 2. Point the row at the new key. On failure the copy orphans, which costs
    //    storage but breaks nothing — the row still resolves via the old path.
    const { error: updErr } = await db
      .from(table)
      .update({ [column]: newPath })
      .eq('id', row.id);
    if (updErr) {
      console.error(`  ! ${table}#${row.id}: update failed: ${updErr.message} (orphan left at ${newPath})`);
      failed++;
      continue;
    }

    // 3. Drop the phone-keyed original. The row is already correct, so a
    //    failure here is untidy, not dangerous.
    const { error: rmErr } = await db.storage.from(BUCKET).remove([oldPath]);
    if (rmErr) {
      console.warn(`  ~ ${table}#${row.id}: migrated, but old ${oldPath} not deleted: ${rmErr.message}`);
    }

    migrated++;
  }

  return { migrated, skipped, failed };
}

const totals = { migrated: 0, skipped: 0, failed: 0 };

console.log(APPLY
  ? `Re-keying ${BUCKET} objects onto UUIDs.\n`
  : `DRY RUN — nothing will be changed. Re-run with --apply to migrate.\n`);

for (const target of TARGETS) {
  console.log(`${target.table}.${target.column}  (${target.folder}/)`);
  const r = await migrateTarget(target);
  console.log(`  ${r.migrated} to migrate, ${r.skipped} already done, ${r.failed} failed\n`);
  totals.migrated += r.migrated;
  totals.skipped += r.skipped;
  totals.failed += r.failed;
}

console.log(`${APPLY ? 'Migrated' : 'Would migrate'} ${totals.migrated}, skipped ${totals.skipped}, failed ${totals.failed}.`);

if (totals.failed > 0) {
  console.error('\nSome rows failed — re-running is safe and will retry only those.');
  process.exit(1);
}
