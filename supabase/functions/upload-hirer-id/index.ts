import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Mirrors the web app's uploadFile() (web/src/lib/storage.js): same bucket,
// same folder/<id>.<ext> naming, upsert, and public URL — just routed through
// this service-role function so the mobile client needs no storage access.
const BUCKET = 'shramikfiles';
const FOLDER = 'hireraadhaar';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB, matching validateDocFile()

function contentTypeFor(ext: string): string {
  switch (ext) {
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'heic': return 'image/heic';
    case 'heif': return 'image/heif';
    case 'pdf': return 'application/pdf';
    default: return 'image/jpeg';
  }
}

/** Resolve the service-role key from whichever env var is available. */
function getServiceRoleKey(): string {
  // New format: SUPABASE_SECRET_KEYS is a JSON dict of secret API keys.
  const secretKeysRaw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (secretKeysRaw) {
    try {
      const keys = JSON.parse(secretKeysRaw);
      const values = Object.values(keys) as string[];
      if (values.length > 0) return values[0];
    } catch { /* fall through */ }
  }
  // Legacy (deprecated) env var.
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;

  throw new Error('No service-role key found in environment');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      getServiceRoleKey(),
    );

    // The hirer is derived from the caller's JWT, never from the body.
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData?.user) {
      return json({ error: 'You must be signed in to upload your ID' }, 401);
    }

    const { data: hirer } = await supabaseAdmin
      .from('hirers')
      .select('id, mobile_no')
      .eq('auth_user_id', userData.user.id)
      .maybeSingle();
    if (!hirer) {
      return json({ error: 'No hirer profile found for this account' }, 403);
    }

    const { file_base64, ext, profile } = await req.json();
    if (!file_base64 || typeof file_base64 !== 'string') {
      return json({ error: 'No file provided' }, 400);
    }

    // Decode base64 -> bytes.
    let bytes: Uint8Array;
    try {
      const binary = atob(file_base64);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    } catch (_) {
      return json({ error: 'Invalid file data' }, 400);
    }
    if (bytes.length === 0) {
      return json({ error: 'Empty file' }, 400);
    }
    if (bytes.length > MAX_BYTES) {
      return json({ error: 'Document must be smaller than 10 MB' }, 413);
    }

    // Renamed to the hirer's mobile number, like the web app names files by id.
    const mobile = String(hirer.mobile_no ?? '').replace(/\D/g, '');
    if (!mobile) {
      return json({ error: 'Hirer has no mobile number on file' }, 400);
    }
    const safeExt = String(ext ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${FOLDER}/${mobile}.${safeExt}`;
    const contentType = contentTypeFor(safeExt);

    // Ensure the bucket exists — public, to match the web app's public URLs.
    // Idempotent: if it already exists, createBucket is skipped/ignored.
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    if (!buckets?.some((b) => b.name === BUCKET)) {
      const { error: bucketErr } = await supabaseAdmin.storage.createBucket(BUCKET, { public: true });
      if (bucketErr && !bucketErr.message.toLowerCase().includes('already exists')) {
        console.error('createBucket failed:', bucketErr.message);
        return json({ error: `Could not initialize storage: ${bucketErr.message}` }, 500);
      }
    }

    // Standard Supabase Storage upload (same as web/src/lib/storage.js).
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, bytes, { upsert: true, contentType });
    if (upErr) {
      console.error('storage upload failed:', upErr.message);
      return json({ error: `Could not upload your ID: ${upErr.message}` }, 500);
    }

    const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = pub.publicUrl;

    // Write the ID URL AND the rest of the onboarding profile with the service
    // role. These fields didn't persist before because the client's UPDATE on
    // hirers is blocked by RLS (0 rows updated, no error).
    const p = (profile && typeof profile === 'object') ? profile as Record<string, unknown> : {};
    const update: Record<string, unknown> = {
      aadhar_url: publicUrl,
      completion_status: 'completed',
    };
    const ALLOWED_ENTITY = ['Individual', 'Contractor', 'Builder', 'Company'];
    if (typeof p.entity_type === 'string' && ALLOWED_ENTITY.includes(p.entity_type)) {
      update.entity_type = p.entity_type;
    }
    for (const key of ['company_name', 'gst_number', 'city', 'state', 'address', 'pincode']) {
      const v = p[key];
      if (typeof v === 'string' && v.trim() !== '') update[key] = v.trim();
    }

    const { error: updErr } = await supabaseAdmin
      .from('hirers')
      .update(update)
      .eq('id', hirer.id);
    if (updErr) {
      console.error('hirers update failed:', updErr.message);
      return json({ error: 'Uploaded, but could not save your details' }, 500);
    }

    return json({ success: true, path, url: publicUrl });
  } catch (err) {
    console.error('upload-hirer-id error:', err?.message ?? err);
    return json({ error: 'Unexpected server error' }, 500);
  }
});
