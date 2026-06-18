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

    // 2. Invite user — sends invite email, hirer clicks link → redirected to set-password page
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      hirer.email,
      {
        redirectTo: 'https://www.shramikrojgar.in/set-password',
        data: { first_name: hirer.first_name, last_name: hirer.last_name },
      },
    );

    console.log('inviteUserByEmail status:', authError ? `ERROR: ${authError.message} | ${JSON.stringify(authError)}` : 'OK', 'user:', authData?.user?.id);

    let authUserId: string;

    if (authError) {
      // User might already exist in auth from a previous attempt
      const errStr = authError.message?.toLowerCase() ?? '';
      if (errStr.includes('already') || errStr.includes('exists')) {
        const { data: list } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        const existing = list?.users?.find(u => u.email === hirer.email);
        if (!existing) {
          return new Response(JSON.stringify({ error: authError.message || 'Invite failed' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        authUserId = existing.id;
      } else {
        return new Response(JSON.stringify({ error: authError.message || 'Invite failed' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      authUserId = authData.user.id;
    }

    // 3. Save auth_user_id + mark active + verified
    const { error: updateError } = await supabaseAdmin
      .from('hirers')
      .update({
        status:           'active',
        is_verified:      true,
        auth_user_id:     authUserId,
        rejection_reason: null,
      })
      .eq('id', hirer_id);

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ success: true, auth_user_id: authUserId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    console.error('Unexpected error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
