import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import * as Sentry from '@sentry/react'
import { queryClient } from './lib/queryClient.js'
import { initSentry } from './lib/sentry.js'
import './index.css'
import App from './App.jsx'

// Before render, so a crash during the first paint still reports.
initSentry()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<CrashScreen />} showDialog={false}>
      <QueryClientProvider client={queryClient}>
        <App />
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>,
)

// A render crash currently blanks the page with nothing but a console trace an
// admin will never open. Give them something to act on, and a way back.
function CrashScreen() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24,
      fontFamily: 'system-ui, sans-serif', textAlign: 'center',
    }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Something broke.</h1>
      <p style={{ fontSize: 14, color: '#666', margin: 0, maxWidth: 420 }}>
        The error has been reported. Reloading usually fixes it — if it doesn&apos;t,
        tell the team what you were doing when it happened.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: '8px 16px', borderRadius: 8, border: '1px solid #ddd',
          background: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer',
        }}
      >
        Reload
      </button>
    </div>
  )
}
