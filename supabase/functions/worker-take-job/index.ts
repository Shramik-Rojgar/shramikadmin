import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Quick jobs (booking_type = 'quick') assign the worker the moment they tap
// "Take Job" — there is no hirer approval. Workers have no INSERT on
// job_workers (RLS), so the assignment is performed here with the service role.
// This mirrors what the hirer's accept action does for standard jobs:
//   1. record the application as accepted,
//   2. insert the job_workers assignment,
//   3. bump jobs.selected_workers_count.
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
      return json({ error: 'You must be signed in to take a job' }, 401);
    }

    const { job_id } = await req.json();
    if (!job_id) {
      return json({ error: 'Missing job' }, 400);
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

    // Load the job and validate it can be taken.
    const { data: job } = await supabaseAdmin
      .from('jobs')
      .select('id, hirer_id, status, booking_type, workers_required, selected_workers_count')
      .eq('id', job_id)
      .maybeSingle();
    if (!job) {
      return json({ error: 'Job not found' }, 404);
    }
    if (job.booking_type !== 'quick') {
      return json({ error: 'This job must be applied for, not taken directly' }, 400);
    }
    if (job.status !== 'hiring') {
      return json({ error: 'This job is no longer open' }, 409);
    }

    // Already assigned? Treat as success so a double-tap is harmless.
    const { data: existingWorker } = await supabaseAdmin
      .from('job_workers')
      .select('id')
      .eq('job_id', job_id)
      .eq('labourer_id', labourer.id)
      .maybeSingle();
    if (existingWorker) {
      return json({ success: true, already_assigned: true });
    }

    // Capacity check against the live count of active assignments (authoritative,
    // not the cached selected_workers_count).
    const required = Number(job.workers_required) || 1;
    const { count: activeCount } = await supabaseAdmin
      .from('job_workers')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', job_id)
      .neq('status', 'cancelled');
    if ((activeCount ?? 0) >= required) {
      return json({ error: 'This job is already fully booked' }, 409);
    }

    // 1. Record the application as accepted (audit trail + dedupe). Reuse any
    // existing application row for this worker/job rather than duplicating.
    let applicationId: string | null = null;
    const { data: existingApp } = await supabaseAdmin
      .from('job_applications')
      .select('id')
      .eq('job_id', job_id)
      .eq('labourer_id', labourer.id)
      .maybeSingle();
    if (existingApp) {
      await supabaseAdmin
        .from('job_applications')
        .update({ status: 'accepted' })
        .eq('id', existingApp.id);
      applicationId = existingApp.id;
    } else {
      const { data: newApp, error: appErr } = await supabaseAdmin
        .from('job_applications')
        .insert({
          job_id,
          labourer_id: labourer.id,
          hirer_id: job.hirer_id,
          status: 'accepted',
        })
        .select('id')
        .single();
      if (appErr) {
        console.error('job_applications insert failed:', appErr.message);
        return json({ error: 'Could not record the application' }, 500);
      }
      applicationId = newApp.id;
    }

    // 2. Assign the worker to the job.
    const { error: workerErr } = await supabaseAdmin
      .from('job_workers')
      .insert({
        job_id,
        labourer_id: labourer.id,
        hirer_id: job.hirer_id,
        application_id: applicationId,
        status: 'assigned',
      });
    if (workerErr) {
      // A concurrent take by the same worker trips the unique constraint —
      // treat as already assigned rather than an error.
      if (workerErr.code === '23505') {
        return json({ success: true, already_assigned: true });
      }
      console.error('job_workers insert failed:', workerErr.message);
      return json({ error: 'Could not assign you to this job' }, 500);
    }

    // 3. Bump the confirmed worker count to the live active count.
    await supabaseAdmin
      .from('jobs')
      .update({
        selected_workers_count: (activeCount ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job_id);

    return json({ success: true });
  } catch (err) {
    console.error('Unexpected error:', err?.message ?? err);
    return json({ error: 'Unexpected server error' }, 500);
  }
});
