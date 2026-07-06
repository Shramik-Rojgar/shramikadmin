// Proxies Supabase's Management API log endpoints so the browser never
// needs an organization-level Personal Access Token.
//
// Required secrets (set with `supabase secrets set`):
//   MGMT_ACCESS_TOKEN  — a Management API personal access token
//                        (Dashboard → Account → Access Tokens)
//   MGMT_PROJECT_REF   — this project's ref (Dashboard → Settings → General)
//
// Note: names starting with `SUPABASE_` are reserved by the platform and
// silently rejected by `supabase secrets set` — hence the `MGMT_` prefix.
//
// Called from the admin app as:
//   supabase.functions.invoke('get-system-logs', { body: { source, range, limit } })
// where `source` is one of: api | auth | edge-functions | postgres
// and `range` is one of: 1h | 3h | 24h (defaults to 1h)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SOURCE_TABLE: Record<string, string> = {
  api: 'edge_logs',
  auth: 'auth_logs',
  'edge-functions': 'function_edge_logs',
  postgres: 'postgres_logs',
};

const RANGE_HOURS: Record<string, number> = { '1h': 1, '3h': 3, '24h': 24 };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const accessToken = Deno.env.get('MGMT_ACCESS_TOKEN');
    const projectRef = Deno.env.get('MGMT_PROJECT_REF');

    if (!accessToken || !projectRef) {
      return new Response(
        JSON.stringify({ error: 'MGMT_ACCESS_TOKEN / MGMT_PROJECT_REF not configured' }),
        { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { source = 'api', range = '1h', limit = 200 } = await req.json().catch(() => ({}));
    const table = SOURCE_TABLE[source] ?? SOURCE_TABLE.api;
    const hours = RANGE_HOURS[range] ?? 1;

    const isoEnd = new Date();
    const isoStart = new Date(isoEnd.getTime() - hours * 60 * 60 * 1000);

    const sql = `select id, timestamp, event_message, metadata from ${table} order by timestamp desc limit ${Math.min(Number(limit) || 200, 500)}`;

    const params = new URLSearchParams({
      sql,
      iso_timestamp_start: isoStart.toISOString(),
      iso_timestamp_end: isoEnd.toISOString(),
    });

    const url = `https://api.supabase.com/v1/projects/${projectRef}/analytics/endpoints/logs.all?${params}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const detail = await res.text();
      return new Response(JSON.stringify({ error: 'Management API error', detail }), {
        status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const json = await res.json();
    const logs = (json.result ?? []).map((row: any) => ({
      timestamp: row.timestamp,
      level: row.metadata?.[0]?.level ?? 'info',
      message: row.event_message,
    }));

    return new Response(JSON.stringify({ logs }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
