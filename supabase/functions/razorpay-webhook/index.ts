import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Razorpay server-to-server webhook — the source of truth for payment state.
// Covers cases the app can't (user's phone died mid-payment, UPI confirmed
// late by the bank, app killed before verify-razorpay-payment ran).
// Deployed with verify_jwt = false (see config.toml); authenticity comes from
// the RAZORPAY_WEBHOOK_SECRET signature instead.

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
  try {
    const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
    if (!webhookSecret) {
      return new Response('Webhook secret not configured', { status: 500 });
    }

    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature') ?? '';
    const expected = await hmacSha256Hex(webhookSecret, rawBody);
    if (!signature || !timingSafeEqual(expected, signature)) {
      return new Response('Invalid signature', { status: 401 });
    }

    const event = JSON.parse(rawBody);
    const payment = event?.payload?.payment?.entity;
    const orderId = payment?.order_id;
    if (!orderId) {
      return new Response('ok', { status: 200 });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: paymentRow } = await supabaseAdmin
      .from('payments')
      .select('id, job_id, amount, status')
      .eq('razorpay_order_id', orderId)
      .maybeSingle();
    if (!paymentRow) {
      // Not an order we created — acknowledge so Razorpay stops retrying.
      return new Response('ok', { status: 200 });
    }

    const now = new Date().toISOString();

    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      if (paymentRow.status !== 'captured') {
        const { error: payError } = await supabaseAdmin.from('payments').update({
          payment_id: payment.id,
          razorpay_payment_id: payment.id,
          payment_method: payment.method ?? 'upi',
          status: 'captured',
          paid_at: now,
          updated_at: now,
        }).eq('id', paymentRow.id);

        const { error: jobError } = await supabaseAdmin.from('jobs').update({
          status: 'hiring',
          escrow_status: 'funded',
          payment_status: 'paid',
          escrow_amount: paymentRow.amount,
          updated_at: now,
        }).eq('id', paymentRow.job_id).eq('status', 'pending_payment');

        // Non-2xx makes Razorpay retry the event, so a transient DB failure
        // doesn't strand a captured payment.
        if (payError || jobError) {
          console.error('Webhook DB update failed:', payError?.message ?? jobError?.message);
          return new Response('error', { status: 500 });
        }
      }
    } else if (event.event === 'payment.failed') {
      if (paymentRow.status === 'created') {
        await supabaseAdmin.from('payments').update({
          status: 'failed',
          razorpay_payment_id: payment.id,
          failure_reason: payment.error_description ?? payment.error_code ?? 'failed',
          updated_at: now,
        }).eq('id', paymentRow.id);

        // Only unpaid jobs are marked failed — a late failure event for an
        // earlier attempt must not clobber a job funded by a retry.
        await supabaseAdmin.from('jobs').update({
          payment_status: 'failed',
          updated_at: now,
        }).eq('id', paymentRow.job_id).eq('status', 'pending_payment');
      }
    }

    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error('Webhook error:', err?.message ?? err);
    return new Response('error', { status: 500 });
  }
});
