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
    const { hirer_id } = await req.json();
    if (!hirer_id) {
      return new Response(JSON.stringify({ error: 'hirer_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Fetch hirer
    const { data: hirer, error: fetchError } = await supabaseAdmin
      .from('hirers')
      .select('id, email, first_name, last_name, status')
      .eq('id', hirer_id)
      .single();

    if (fetchError || !hirer) {
      return new Response(JSON.stringify({ error: 'Hirer not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (hirer.status === 'active') {
      return new Response(JSON.stringify({ error: 'Hirer already approved' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!hirer.email) {
      return new Response(JSON.stringify({ error: 'Hirer has no email address' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Invite user — creates auth user + sends invite email with password-setup link
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      hirer.email,
      { data: { first_name: hirer.first_name, last_name: hirer.last_name } },
    );

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Save auth_user_id + mark active + verified
    const { error: updateError } = await supabaseAdmin
      .from('hirers')
      .update({
        status:       'active',
        is_verified:  true,
        auth_user_id: authData.user.id,
        rejection_reason: null,
      })
      .eq('id', hirer_id);

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
