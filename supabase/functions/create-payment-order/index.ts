import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Razorpay charges 2% + 18% GST on the fee (2.36% effective). The total is
// grossed up so the full labour cost lands in escrow after fees.
const FEE_GROSS_UP = 0.9764;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const keyId = Deno.env.get('RAZORPAY_KEY_ID');
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
    if (!keyId || !keySecret) {
      return json({ error: 'Payment gateway is not configured (missing Razorpay secrets)' }, 500);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // The paying hirer is derived from the caller's JWT, never from the body.
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData?.user) {
      return json({ error: 'You must be signed in to make a payment' }, 401);
    }

    const { data: hirer } = await supabaseAdmin
      .from('hirers')
      .select('id, email, first_name, last_name')
      .eq('auth_user_id', userData.user.id)
      .maybeSingle();
    if (!hirer) {
      return json({ error: 'No hirer profile found for this account' }, 403);
    }

    const { job, existing_job_id } = await req.json();

    const wage = Number(job?.wage_amount);
    const workers = Number(job?.workers_required);
    const days = Number(job?.estimated_days);
    if (!job?.title || !Number.isFinite(wage) || wage <= 0 ||
        !Number.isInteger(workers) || workers <= 0 ||
        !Number.isInteger(days) || days <= 0) {
      return json({ error: 'Invalid job details' }, 400);
    }
    if (wage > 100000 || workers > 500 || days > 365) {
      return json({ error: 'Job size exceeds allowed limits' }, 400);
    }

    // Amount is computed server-side; the client's figures are display-only.
    const labourCost = wage * workers * days;
    const total = Math.round((labourCost / FEE_GROSS_UP) * 100) / 100;
    const amountPaise = Math.round(total * 100);
    const transactionFee = Math.round(total * 2) / 100;
    const gst = Math.round(transactionFee * 18) / 100;

    // Reuse the pending job from a previous failed attempt instead of
    // inserting duplicates on retry.
    let jobRow: { id: string; job_id?: string } | null = null;
    let createdNow = false;
    if (existing_job_id) {
      const { data } = await supabaseAdmin
        .from('jobs')
        .select('id, job_id')
        .eq('id', existing_job_id)
        .eq('hirer_id', hirer.id)
        .eq('status', 'pending_payment')
        .maybeSingle();
      jobRow = data;
      if (jobRow) {
        // A previous attempt may have left payment_status = 'failed'.
        await supabaseAdmin
          .from('jobs')
          .update({ payment_status: 'pending', updated_at: new Date().toISOString() })
          .eq('id', jobRow.id);
      }
    }

    if (!jobRow) {
      const jobData = {
        ...job,
        hirer_id: hirer.id,
        estimated_total_amount: labourCost,
        escrow_amount: total,
        escrow_status: 'pending',
        payment_status: 'pending',
        status: 'pending_payment', // hidden from workers until escrow is funded
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabaseAdmin
        .from('jobs')
        .insert(jobData)
        .select('id, job_id')
        .single();
      if (error) {
        return json({ error: `Could not create job: ${error.message}` }, 500);
      }
      jobRow = data;
      createdNow = true;
    }

    // Create the Razorpay Order — checkout can only collect this exact amount.
    const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${keyId}:${keySecret}`),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: 'INR',
        receipt: String(jobRow.id).slice(0, 40),
        notes: {
          job_uuid: String(jobRow.id),
          job_code: String(jobRow.job_id ?? ''),
          hirer_id: String(hirer.id),
          purpose: 'escrow',
        },
      }),
    });
    const order = await rzpRes.json();
    if (!rzpRes.ok) {
      if (createdNow) {
        await supabaseAdmin.from('jobs').delete().eq('id', jobRow.id);
      }
      console.error('Razorpay order creation failed:', JSON.stringify(order));
      return json({ error: order?.error?.description ?? 'Could not create payment order' }, 502);
    }

    const now = new Date().toISOString();
    const { error: payError } = await supabaseAdmin.from('payments').insert({
      payment_id: order.id, // replaced by the real payment id once captured
      job_id: jobRow.id,
      hirer_id: hirer.id,
      payment_type: 'escrow',
      amount: total,
      currency: 'INR',
      payment_method: 'upi',
      status: 'created',
      razorpay_order_id: order.id,
      created_at: now,
      updated_at: now,
    });
    if (payError) {
      console.error('payments insert failed:', payError.message);
      return json({ error: `Could not record payment: ${payError.message}` }, 500);
    }

    return json({
      success: true,
      order_id: order.id,
      amount: amountPaise,
      currency: 'INR',
      key_id: keyId,
      job_uuid: jobRow.id,
      prefill: {
        name: [hirer.first_name, hirer.last_name].filter(Boolean).join(' ') || (job?.contact_name ?? ''),
        email: hirer.email ?? '',
        contact: job?.contact_phone ?? '',
      },
      breakdown: { labour_cost: labourCost, transaction_fee: transactionFee, gst, total },
    });
  } catch (err) {
    console.error('Unexpected error:', err?.message ?? err);
    return json({ error: 'Unexpected server error' }, 500);
  }
});
