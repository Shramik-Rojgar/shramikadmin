import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import Sidebar from './components/Sidebar';
import BackgroundOrbs from './components/BackgroundOrbs';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Workers from './pages/Workers';
import WorkersManage from './pages/WorkersManage';
import Hirers from './pages/Hirers';
import HirersManage from './pages/HirersManage';
import PaymentsVerification from './pages/PaymentsVerification';
import PaymentsSettlements from './pages/PaymentsSettlements';
import Jobs from './pages/Jobs';
import Analytics from './pages/Analytics';
import UsersPage from './pages/Users';
import Logs from './pages/Logs';
import WorkerDetail from './pages/WorkerDetail';
import JobDetail from './pages/JobDetail';
import HirerDetail from './pages/HirerDetail';
import NotFound from './pages/NotFound';
import { Loader2, Monitor, ShieldCheck } from 'lucide-react';

function Placeholder({ title }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h1 className="font-display font-black text-3xl text-[var(--ink)]">{title}</h1>
      <p className="text-[var(--mut)] font-semibold">Coming soon</p>
    </div>
  );
}

export default function App() {
  const getPageFromPath = () => {
    const path = window.location.pathname.replace(/^\//, '') || 'dashboard';
    return path;
  };

  const [session,   setSession]   = useState(undefined);
  const [userRole,  setUserRole]  = useState(null);
  const [page,      setPage]      = useState(getPageFromPath);
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile,  setIsMobile]  = useState(() => window.innerWidth < 768);

  useEffect(() => {
    if (!session) {
      setUserRole(null);
      return;
    }
    supabase
      .from('admin_users')
      .select('role')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        setUserRole(data?.role || 'admin');
      });
  }, [session]);

  // ── Sync URL Path with State page ───────────────────────
  useEffect(() => {
    const currentPath = window.location.pathname.replace(/^\//, '') || 'dashboard';
    if (currentPath !== page) {
      window.history.pushState(null, '', `/${page}`);
    }
  }, [page]);

  useEffect(() => {
    const handlePopState = () => {
      setPage(getPageFromPath());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // ── Access Guards for Roles ─────────────────
  useEffect(() => {
    if (userRole === 'verification_officer') {
      const allowed = [
        'workers-manage', 'workers-approve', 'workers',
        'hirers-manage', 'hirers-approve', 'hirers'
      ];
      if (!allowed.includes(page) && !page.startsWith('worker-detail/') && !page.startsWith('hirer-detail/') && !page.startsWith('job-detail/')) {
        setPage('workers-manage');
      }
    } else if (userRole === 'finance_admin') {
      const allowed = [
        'payments', 'payments-verification', 'payments-settlements',
        'jobs'
      ];
      if (!allowed.includes(page) && !page.startsWith('job-detail/')) {
        setPage('payments-verification');
      }
    }
  }, [userRole, page]);

  // ── Session Idle Timeout (Inactivity Auto-Logout) ───────────
  useEffect(() => {
    if (!session) return;

    let timeoutId;
    const INACTIVITY_LIMIT = 15 * 60 * 1000; // 15 minutes lockout

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        handleLogout();
        alert('Security Notice: You have been logged out due to inactivity.');
      }, INACTIVITY_LIMIT);
    };

    // User interaction event triggers
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(name => window.addEventListener(name, resetTimer));

    resetTimer(); // Start timer

    return () => {
      clearTimeout(timeoutId);
      events.forEach(name => window.removeEventListener(name, resetTimer));
    };
  }, [session]);

  // ── Detect mobile on resize ────────────────────────────
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ── Mobile? Block everything ───────────────────────────
  if (isMobile) {
    return (
      <div className="mobile-blocker" style={{ display: 'flex' }}>
        <BackgroundOrbs />
        <div className="mobile-blocker-card">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
            style={{ background: 'var(--grad)' }}
          >
            <Monitor size={28} color="#fff" strokeWidth={2} />
          </div>
          <div className="flex items-center justify-center gap-2 mb-2">
            <ShieldCheck size={18} className="text-[var(--accent)]" strokeWidth={2.5} />
            <span
              className="font-display font-black text-lg tracking-tight"
              style={{
                background: 'var(--grad)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              SHRAMIK
            </span>
          </div>
          <h2 className="font-display font-bold text-xl text-[var(--ink)] mb-2">
            Desktop Only
          </h2>
          <p className="text-sm text-[var(--mut)] font-semibold leading-relaxed max-w-xs mx-auto">
            The Admin Console is optimized for larger screens. Please switch to a <strong className="text-[var(--ink)]">desktop</strong> or <strong className="text-[var(--ink)]">tablet</strong> to continue.
          </p>
        </div>
      </div>
    );
  }

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
  const DETAIL_PREFIXES = ['worker-detail/', 'job-detail/', 'hirer-detail/'];
  const KNOWN_PAGES = [
    'dashboard', 'workers-manage', 'workers-approve', 'workers',
    'hirers', 'hirers-manage', 'hirers-approve',
    'payments', 'payments-verification', 'payments-settlements',
    'jobs', 'analytics', 'users', 'logs', 'settings',
  ];
  const isKnownPage = KNOWN_PAGES.includes(page) || DETAIL_PREFIXES.some(p => page.startsWith(p));

  const renderPage = () => {
    if (page.startsWith('worker-detail/')) {
      const workerId = page.slice('worker-detail/'.length);
      return <WorkerDetail workerId={workerId} onNav={setPage} onBack={() => setPage('workers-manage')} />;
    }
    if (page.startsWith('job-detail/')) {
      const jobId = page.slice('job-detail/'.length);
      return <JobDetail jobId={jobId} onBack={() => setPage('jobs')} />;
    }
    if (page.startsWith('hirer-detail/')) {
      const hirerId = page.slice('hirer-detail/'.length);
      return <HirerDetail hirerId={hirerId} onNav={setPage} onBack={() => setPage('hirers-manage')} />;
    }

    switch (page) {
      case 'dashboard':       return <Dashboard />;
      case 'workers-manage':  return <WorkersManage onNav={setPage} />;
      case 'workers-approve': return <Workers />;
      case 'workers':         return <WorkersManage onNav={setPage} />;
      case 'hirers':          return <HirersManage onNav={setPage} />;
      case 'hirers-manage':   return <HirersManage onNav={setPage} />;
      case 'hirers-approve':  return <Hirers />;
      case 'payments':             return <PaymentsVerification />;
      case 'payments-verification': return <PaymentsVerification />;
      case 'payments-settlements':  return <PaymentsSettlements />;
      case 'jobs':            return <Jobs onNav={setPage} />;
      case 'analytics':       return <Analytics />;
      case 'users':           return <UsersPage userRole={userRole} />;
      case 'logs':            return <Logs />;
      case 'settings':        return <Placeholder title="Settings" />;
      default:                return <NotFound onNav={setPage} />;
    }
  };

  if (!isKnownPage) {
    return (
      <div className="min-h-screen font-sans text-[var(--ink)]">
        <BackgroundOrbs />
        <NotFound onNav={setPage} />
      </div>
    );
  }

  return (
    <div className="min-h-screen font-sans text-[var(--ink)]">
      <BackgroundOrbs />
      <Sidebar
        active={page}
        userRole={userRole}
        onNav={setPage}
        onLogout={handleLogout}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(c => !c)}
      />
      <main className="main-content" style={{ marginLeft: collapsed ? 64 : 240 }}>
        {renderPage()}
      </main>
    </div>
  );
}
