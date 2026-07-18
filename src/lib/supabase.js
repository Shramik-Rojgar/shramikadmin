import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Optional: the Data API URL of a read replica / load balancer (paid add-on,
// provisioned in the dashboard). When unset, reads go to the primary and
// `supabaseRead` is literally the same client — a true no-op. See
// supabase/CONNECTIONS.md for provisioning + the read-your-writes caveat.
const replicaUrl = import.meta.env.VITE_SUPABASE_REPLICA_URL;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    '[Shramik Admin] Supabase keys missing.\n' +
    'Open admin/.env and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  );
}

// The primary. Handles auth and every write.
export const supabase = createClient(supabaseUrl, supabaseKey);

// Read-only client for heavy aggregation pages (Analytics, Dashboard) so a slow
// full-table scan burns the replica's CPU, not the primary that serves the app.
// ONLY use this for reads with no read-your-writes expectation — a replica lags
// the primary by up to a few seconds, so a page that writes then re-reads must
// stay on `supabase`.
export const supabaseRead = replicaUrl
  ? createClient(replicaUrl, supabaseKey, {
      // The primary owns the session; this client just mirrors its token below.
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : supabase;

// A separate client starts unauthenticated, so its reads would hit the replica
// as `anon` and RLS would deny them. Mirror the admin's session onto it so RLS
// still applies as the logged-in admin. No-op when there's no replica (same
// client). onAuthStateChange fires with the current session on subscribe, so an
// already-logged-in admin is covered on page load, not just at sign-in.
if (supabaseRead !== supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) {
      supabaseRead.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
    }
  });
}
