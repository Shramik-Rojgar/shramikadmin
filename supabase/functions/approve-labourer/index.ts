import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // 1. Fetch labourer's mobile number
    const { data: labourer, error: fetchError } = await supabaseAdmin
      .from('labourers')
      .select('id, mobile_no, status')
      .eq('id', labourer_id)
      .single();

    if (fetchError || !labourer) {
      return new Response(JSON.stringify({ error: 'Labourer not found' }), {
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
      phone: labourer.mobile_no,
      phone_confirm: true,
    });

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Update labourer row with auth_user_id and approved status
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
