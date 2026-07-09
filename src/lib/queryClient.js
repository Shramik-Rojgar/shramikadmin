import { QueryClient } from '@tanstack/react-query';

// Shared cache config for the whole admin console. Data here changes at
// human speed (an admin approving a worker, a payout landing) — there's no
// need to re-hit Supabase every time a page remounts or the tab regains
// focus, so we cache aggressively and let explicit invalidation (after a
// mutation) or the page's own Refresh button pull fresh data instead.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,        // data is "fresh" for 1 minute — no refetch on remount within that window
      gcTime: 10 * 60 * 1000,      // keep unused cache entries around for 10 minutes in case the admin navigates back
      refetchOnWindowFocus: false, // avoid surprise reads just from tab-switching
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});
