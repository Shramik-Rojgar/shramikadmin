import * as Sentry from '@sentry/react';

// Absent DSN = Sentry off. That's the intended state for local dev and for any
// build where the env var wasn't set — init() simply no-ops rather than
// throwing, so a missing DSN can never take down the dashboard.
const DSN = import.meta.env.VITE_SENTRY_DSN;

export function initSentry() {
  if (!DSN) return;

  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,

    // Traces are sampled; errors are not. 10% is plenty to spot a slow page and
    // keeps you inside the free tier at current volume. Raise it when there's
    // traffic worth sampling.
    tracesSampleRate: 0.1,

    integrations: [Sentry.browserTracingIntegration()],

    // This dashboard handles government IDs and phone numbers. Do not let the
    // SDK collect request bodies, cookies, or headers on its own initiative.
    sendDefaultPii: false,

    beforeSend(event) {
      // Signed URLs carry a token that grants read access for its lifetime.
      // An error report is not a place to park one.
      if (event.request?.url) {
        event.request.url = event.request.url.split('?')[0];
      }
      return event;
    },
  });
}
