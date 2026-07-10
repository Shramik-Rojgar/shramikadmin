import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/** Resolve the service-role key from whichever env var is available. */
function getServiceRoleKey(): string {
  const secretKeysRaw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (secretKeysRaw) {
    try {
      const values = Object.values(JSON.parse(secretKeysRaw)) as string[];
      if (values.length > 0) return values[0];
    } catch { /* fall through */ }
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  throw new Error('No service-role key found in environment');
}

const star = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
};

// A hirer rates the workers on one of their completed jobs. Runs with the
// service role because it writes worker_ratings and updates the aggregate
// columns on labourers (both blocked from the client by RLS). Ownership is
// verified against the caller's JWT.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, getServiceRoleKey());

    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData?.user) {
      return json({ error: 'You must be signed in to rate workers' }, 401);
    }

    const { data: hirer } = await supabaseAdmin
      .from('hirers')
      .select('id')
      .eq('auth_user_id', userData.user.id)
      .maybeSingle();
    if (!hirer) {
      return json({ error: 'No hirer profile found for this account' }, 403);
    }

    const { job_id, ratings } = await req.json();
    if (!job_id || !Array.isArray(ratings) || ratings.length === 0) {
      return json({ error: 'Nothing to submit' }, 400);
    }

    // The job must belong to this hirer.
    const { data: job } = await supabaseAdmin
      .from('jobs')
      .select('id, hirer_id')
      .eq('id', job_id)
      .maybeSingle();
    if (!job || job.hirer_id !== hirer.id) {
      return json({ error: 'Job not found' }, 403);
    }

    // Only job_workers that actually belong to this job can be rated; the
    // labourer_id is taken from the server, never the client.
    const { data: jws } = await supabaseAdmin
      .from('job_workers')
      .select('id, labourer_id')
      .eq('job_id', job_id);
    const jwMap = new Map((jws ?? []).map((w: { id: string; labourer_id: string }) => [w.id, w.labourer_id]));

    const now = new Date().toISOString();
    const rows: Record<string, unknown>[] = [];
    const affected = new Set<string>();
    for (const r of ratings) {
      const jwId = r?.job_worker_id;
      const labourerId = jwMap.get(jwId);
      if (!labourerId) continue; // not a worker on this job
      const overall = star(r?.rating);
      if (!overall) continue; // overall rating is required
      rows.push({
        job_id,
        job_worker_id: jwId,
        labourer_id: labourerId,
        hirer_id: hirer.id,
        rating: overall,
        review: (typeof r?.review === 'string' && r.review.trim()) ? r.review.trim() : null,
        punctuality: star(r?.punctuality),
        quality_of_work: star(r?.quality_of_work),
        communication: star(r?.communication),
        professionalism: star(r?.professionalism),
        would_hire_again: typeof r?.would_hire_again === 'boolean' ? r.would_hire_again : null,
        updated_at: now,
      });
      affected.add(labourerId);
    }

    if (rows.length === 0) {
      return json({ error: 'An overall star rating is required for each worker' }, 400);
    }

    // Unique(job_worker_id) — upsert so re-rating updates the existing row.
    const { error: upErr } = await supabaseAdmin
      .from('worker_ratings')
      .upsert(rows, { onConflict: 'job_worker_id' });
    if (upErr) {
      console.error('worker_ratings upsert failed:', upErr.message);
      return json({ error: `Could not save ratings: ${upErr.message}` }, 500);
    }

    // Recompute average_rating + total_ratings for each affected labourer.
    for (const labourerId of affected) {
      const { data: all } = await supabaseAdmin
        .from('worker_ratings')
        .select('rating')
        .eq('labourer_id', labourerId);
      const list = all ?? [];
      const total = list.length;
      const avg = total > 0
        ? list.reduce((s: number, x: { rating: number }) => s + Number(x.rating), 0) / total
        : 0;
      await supabaseAdmin
        .from('labourers')
        .update({ average_rating: Math.round(avg * 100) / 100, total_ratings: total })
        .eq('id', labourerId);
    }

    return json({ success: true, saved: rows.length });
  } catch (err) {
    console.error('rate-worker error:', err?.message ?? err);
    return json({ error: 'Unexpected server error' }, 500);
  }
});
