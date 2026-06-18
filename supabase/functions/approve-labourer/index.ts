import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Normalize Indian mobile to E.164 (+91XXXXXXXXXX)
function toE164(mobile: string): string {
  const digits = mobile.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

async function sendApprovalSMS(mobile: string): Promise<void> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from       = Deno.env.get('TWILIO_FROM_NUMBER');

  if (!accountSid || !authToken || !from) {
    console.warn('[SMS] Twilio env vars not set — skipping SMS');
    return;
  }

  const to = toE164(mobile);
  const credentials = btoa(`${accountSid}:${authToken}`);

  const body = new URLSearchParams({
    To:   to,
    From: from,
    Body: 'Congratulations! Your Shramik profile has been approved. You can now log in with your mobile number.',
  });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    },
  );

  if (!res.ok) {
    const err = await res.text();
    console.error('[SMS] Twilio error:', err);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { labourer_id } = await req.json();
    if (!labourer_id) {
      return new Response(JSON.stringify({ error: 'labourer_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Service role client — required for auth.admin calls
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Fetch labourer
    console.log('[approve] labourer_id:', labourer_id);
    const { data: labourer, error: fetchError } = await supabaseAdmin
      .from('labourers')
      .select('id, mobile_no, full_name, status')
      .eq('id', labourer_id)
      .single();

    console.log('[approve] fetch result:', JSON.stringify({ labourer, fetchError }));

    if (fetchError || !labourer) {
      return new Response(JSON.stringify({ error: 'Labourer not found', detail: fetchError?.message }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (labourer.status === 'approved') {
      return new Response(JSON.stringify({ error: 'Labourer already approved' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Create auth user with phone (pre-confirmed — no OTP needed)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      phone: toE164(labourer.mobile_no),
      phone_confirm: true,
    });

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Save auth_user_id + mark approved
    const { error: updateError } = await supabaseAdmin
      .from('labourers')
      .update({
        status: 'approved',
        auth_user_id: authData.user.id,
        rejection_reason: null,
      })
      .eq('id', labourer_id);

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Send approval SMS (non-blocking — failure doesn't fail the approval)
    await sendApprovalSMS(labourer.mobile_no);

    return new Response(
      JSON.stringify({ success: true, auth_user_id: authData.user.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
