import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData?.user) {
      return json({ error: 'You must be signed in to complete a job' }, 401);
    }

    const { job_id, code } = await req.json();
    if (!job_id || code == null) {
      return json({ error: 'Missing job or code' }, 400);
    }

    const { data: labourer } = await supabaseAdmin
      .from('labourers')
      .select('id')
      .eq('auth_user_id', userData.user.id)
      .maybeSingle();
    if (!labourer) {
      return json({ error: 'No worker profile found for this account' }, 403);
    }

    const { data: jobWorker } = await supabaseAdmin
      .from('job_workers')
      .select('id')
      .eq('job_id', job_id)
      .eq('labourer_id', labourer.id)
      .maybeSingle();
    if (!jobWorker) {
      return json({ error: 'You are not assigned to this job' }, 403);
    }

    // Today's attendance row holds the completion code issued at check-in.
    const todayStr = new Date().toISOString().slice(0, 10);
    const { data: attendance } = await supabaseAdmin
      .from('attendance')
      .select('id, work_status, complete_code')
      .eq('job_worker_id', jobWorker.id)
      .eq('attendance_date', todayStr)
      .maybeSingle();

    if (!attendance) {
      return json({ error: "You haven't started work today yet" }, 409);
    }
    if (attendance.work_status === 'completed') {
      return json({ success: true, already_completed: true });
    }
    if (attendance.work_status !== 'started') {
      return json({ error: 'Work has not been started for today' }, 409);
    }

    // Verify the entered code against the code stored at check-in.
    const expected = String(attendance.complete_code ?? '').replace(/\D/g, '');
    const entered = String(code).replace(/\D/g, '');
    if (!expected) {
      return json({ error: 'No completion code was issued for today. Please ask the hirer.' }, 409);
    }
    if (!entered || parseInt(entered, 10) !== parseInt(expected, 10)) {
      return json({ error: 'Incorrect code. Please ask the hirer and try again.' }, 400);
    }

    // Completing with the hirer's code confirms the worker was present today,
    // so mark attendance present alongside the completed work_status.
    const { error: updErr } = await supabaseAdmin
      .from('attendance')
      .update({ work_status: 'completed', status: 'present' })
      .eq('id', attendance.id);
    if (updErr) {
      console.error('attendance complete update failed:', updErr.message);
      return json({ error: 'Could not mark complete. Please try again.' }, 500);
    }

    return json({ success: true });
  } catch (err) {
    console.error('Unexpected error:', err?.message ?? err);
    return json({ error: 'Unexpected server error' }, 500);
  }
});
