import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import Sidebar from './components/Sidebar';
import BackgroundOrbs from './components/BackgroundOrbs';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Workers from './pages/Workers';
import WorkersManage from './pages/WorkersManage';
import { Loader2 } from 'lucide-react';

function Placeholder({ title }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h1 className="font-display font-black text-3xl text-[var(--ink)]">{title}</h1>
      <p className="text-[var(--mut)] font-semibold">Coming soon</p>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [page, setPage]       = useState('dashboard');

  // ── Restore session on mount & listen for changes ──────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // ── Loading spinner while Supabase restores session ────
  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <BackgroundOrbs />
        <Loader2 size={32} className="animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  // ── Not logged in → show Login ──────────────────────────
  if (!session) {
    return <Login onAuth={setSession} />;
  }

  // ── Logged in → show admin shell ───────────────────────
  const renderPage = () => {
    switch (page) {
      case 'dashboard':       return <Dashboard />;
      case 'workers-manage':  return <WorkersManage />;
      case 'workers-approve': return <Workers />;
      case 'workers':         return <WorkersManage />;  // default workers → manage
      case 'hirers':          return <Placeholder title="Hirers" />;
      case 'jobs':            return <Placeholder title="Job Postings" />;
      case 'analytics':       return <Placeholder title="Analytics" />;
      case 'settings':        return <Placeholder title="Settings" />;
      default:                return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen font-sans text-[var(--ink)]">
      <BackgroundOrbs />
      <Sidebar active={page} onNav={setPage} onLogout={handleLogout} />
      <main className="main-content">
        {renderPage()}
      </main>
    </div>
  );
}
