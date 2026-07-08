import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// The on-site start code is the numeric part of the job's human code
// (jobs.job_id), zero-padded to 4 digits: SHRJ1 -> 0001, SHRJ124 -> 0124.
function expectedCode(jobCode: string): string | null {
  const digits = (jobCode ?? '').replace(/\D/g, '');
  return digits.length ? digits.padStart(4, '0') : null;
}

function codeMatches(entered: string, jobCode: string): boolean {
  const expected = expectedCode(jobCode);
  if (!expected) return false;
  const enteredDigits = (entered ?? '').replace(/\D/g, '');
  if (!enteredDigits) return false;
  return parseInt(enteredDigits, 10) === parseInt(expected, 10);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // The worker is derived from the caller's JWT, never from the body.
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData?.user) {
      return json({ error: 'You must be signed in to start a job' }, 401);
    }

    const { job_id, code } = await req.json();
    if (!job_id || code == null) {
      return json({ error: 'Missing job or code' }, 400);
    }

    // Resolve the labourer profile for this account.
    const { data: labourer } = await supabaseAdmin
      .from('labourers')
      .select('id')
      .eq('auth_user_id', userData.user.id)
      .maybeSingle();
    if (!labourer) {
      return json({ error: 'No worker profile found for this account' }, 403);
    }

    // Fetch the job's human code to verify against.
    const { data: job } = await supabaseAdmin
      .from('jobs')
      .select('id, job_id')
      .eq('id', job_id)
      .maybeSingle();
    if (!job) {
      return json({ error: 'Job not found' }, 404);
    }

    if (!codeMatches(String(code), String(job.job_id ?? ''))) {
      return json({ error: 'Incorrect code. Please ask the hirer and try again.' }, 400);
    }

    // The worker must be assigned to this job (attendance FKs job_workers).
    const { data: jobWorker } = await supabaseAdmin
      .from('job_workers')
      .select('id, status')
      .eq('job_id', job_id)
      .eq('labourer_id', labourer.id)
      .maybeSingle();
    if (!jobWorker) {
      return json({ error: 'You are not assigned to this job' }, 403);
    }

    // A finished/cancelled assignment can't be started. Everything else
    // (assigned, or working from an earlier day) records today's check-in.
    if (jobWorker.status === 'completed') {
      return json({ error: 'This job is already completed' }, 409);
    }
    if (jobWorker.status === 'cancelled') {
      return json({ error: 'This assignment was cancelled' }, 409);
    }
    if (jobWorker.status !== 'assigned' && jobWorker.status !== 'working') {
      return json({ error: 'This job cannot be started right now' }, 409);
    }

    const now = new Date().toISOString();

    // Move assigned -> working only on the first start (keeps the original
    // started_at). 'working' assignments carry over across days unchanged;
    // attendance is what tracks each day's check-in.
    if (jobWorker.status === 'assigned') {
      await supabaseAdmin
        .from('job_workers')
        .update({ status: 'working', started_at: now, updated_at: now })
        .eq('id', jobWorker.id);
    }

    const todayStr = now.slice(0, 10);

    // Generate (or reuse) a 4-digit completion code stored on today's
    // attendance row. The hirer reveals it to the worker at end of day; the
    // worker-complete-job function verifies against it. Reused on a same-day
    // re-check-in so it never changes once issued. Not returned to the worker.
    const { data: existingAtt } = await supabaseAdmin
      .from('attendance')
      .select('complete_code')
      .eq('job_worker_id', jobWorker.id)
      .eq('attendance_date', todayStr)
      .maybeSingle();
    const completeCode = existingAtt?.complete_code
      ?? String(Math.floor(Math.random() * 10000)).padStart(4, '0');

    // Record the check-in — one row per worker per day, idempotent within a
    // day, and a fresh row each new day. `status` is intentionally left unset
    // (null/pending): the hirer marks present/absent later. Omitting it (vs
    // setting null) means a same-day re-check-in never overwrites a status the
    // hirer already recorded.
    const { error: attError } = await supabaseAdmin
      .from('attendance')
      .upsert({
        job_worker_id: jobWorker.id,
        attendance_date: todayStr,
        work_status: 'started',
        complete_code: completeCode,
      }, { onConflict: 'job_worker_id,attendance_date' });
    if (attError) {
      console.error('attendance upsert failed:', attError.message);
      return json({ error: 'Could not record check-in. Please try again.' }, 500);
    }

    return json({ success: true });
  } catch (err) {
    console.error('Unexpected error:', err?.message ?? err);
    return json({ error: 'Unexpected server error' }, 500);
  }
});
