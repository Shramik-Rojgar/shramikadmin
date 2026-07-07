import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const encoder = new TextEncoder();

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const keyId = Deno.env.get('RAZORPAY_KEY_ID');
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
    if (!keyId || !keySecret) {
      return json({ error: 'Payment gateway is not configured' }, 500);
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json();
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return json({ error: 'Missing payment confirmation fields' }, 400);
    }

    // 1. Verify the checkout signature — proves this payment id was issued by
    //    Razorpay for this exact order and hasn't been forged by the client.
    const expected = await hmacSha256Hex(keySecret, `${razorpay_order_id}|${razorpay_payment_id}`);
    if (!timingSafeEqual(expected, String(razorpay_signature))) {
      return json({ error: 'Payment signature verification failed' }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 2. The order must be one we created.
    const { data: paymentRow } = await supabaseAdmin
      .from('payments')
      .select('id, job_id, amount, status')
      .eq('razorpay_order_id', razorpay_order_id)
      .maybeSingle();
    if (!paymentRow) {
      return json({ error: 'Unknown payment order' }, 404);
    }
    if (paymentRow.status === 'captured') {
      return json({ success: true, job_uuid: paymentRow.job_id, already_processed: true });
    }

    // 3. Cross-check the payment with Razorpay directly.
    const auth = 'Basic ' + btoa(`${keyId}:${keySecret}`);
    const payRes = await fetch(`https://api.razorpay.com/v1/payments/${razorpay_payment_id}`, {
      headers: { Authorization: auth },
    });
    let payment = await payRes.json();
    if (!payRes.ok) {
      return json({ error: 'Could not confirm payment with Razorpay' }, 502);
    }
    if (payment.order_id !== razorpay_order_id) {
      return json({ error: 'Payment does not belong to this order' }, 400);
    }
    const expectedPaise = Math.round(Number(paymentRow.amount) * 100);
    if (Number(payment.amount) !== expectedPaise) {
      return json({ error: 'Payment amount mismatch' }, 400);
    }

    // 4. Capture if still only authorized (UPI is normally auto-captured).
    if (payment.status === 'authorized') {
      const capRes = await fetch(`https://api.razorpay.com/v1/payments/${razorpay_payment_id}/capture`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: expectedPaise, currency: 'INR' }),
      });
      if (capRes.ok) payment = await capRes.json();
    }
    if (payment.status !== 'captured') {
      return json({ error: `Payment not captured yet (status: ${payment.status})` }, 409);
    }

    // 5. Mark the payment captured and fund the job escrow.
    const now = new Date().toISOString();
    const { error: payError } = await supabaseAdmin
      .from('payments')
      .update({
        payment_id: razorpay_payment_id,
        razorpay_payment_id,
        razorpay_signature,
        payment_method: payment.method ?? 'upi',
        status: 'captured',
        paid_at: now,
        updated_at: now,
      })
      .eq('id', paymentRow.id);
    if (payError) {
      return json({ error: payError.message }, 500);
    }

    const { error: jobError } = await supabaseAdmin
      .from('jobs')
      .update({
        status: 'hiring',
        escrow_status: 'funded',
        payment_status: 'paid',
        escrow_amount: paymentRow.amount,
        updated_at: now,
      })
      .eq('id', paymentRow.job_id);
    if (jobError) {
      return json({ error: jobError.message }, 500);
    }

    return json({ success: true, job_uuid: paymentRow.job_id });
  } catch (err) {
    console.error('Unexpected error:', err?.message ?? err);
    return json({ error: 'Unexpected server error' }, 500);
  }
});
