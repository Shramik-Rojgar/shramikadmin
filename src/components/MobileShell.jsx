import React, { useMemo, useState } from 'react';
import { cn } from '../lib/utils';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '../components/ui/sheet';
import { NAV, filterNav, sectionOf } from './Sidebar';
import {
  ShieldCheck,
  LogOut,
  Menu,
  LayoutDashboard,
  HardHat,
  UserCheck,
  Briefcase,
  Wallet,
  MoreHorizontal,
} from 'lucide-react';

const QUICK_MAP = {
  dashboard: { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  workers: { id: 'workers-manage', label: 'Workers', icon: HardHat },
  hirers: { id: 'hirers-manage', label: 'Hirers', icon: UserCheck },
  jobs: { id: 'jobs', label: 'Jobs', icon: Briefcase },
  payments: { id: 'payments-verification', label: 'Payments', icon: Wallet },
};

function parentIdFor(childId) {
  const map = {
    'workers-manage': 'workers',
    'workers-approve': 'workers',
    'hirers-manage': 'hirers',
    'hirers-approve': 'hirers',
    'payments-verification': 'payments',
    'payments-settlements': 'payments',
  };
  return map[childId] ?? childId;
}

function usePageLabel(active) {
  return useMemo(() => {
    for (const item of NAV) {
      if (item.id === active) return item.label;
      if (item.children) {
        const child = item.children.find(c => c.id === active);
        if (child) return `${item.label} › ${child.label}`;
      }
    }
    if (active.startsWith('worker-detail/')) return 'Worker Profile';
    if (active.startsWith('hirer-detail/')) return 'Hirer Profile';
    if (active.startsWith('job-detail/')) return 'Job Details';
    return 'Admin Console';
  }, [active]);
}

export default function MobileShell({ active, userRole, onNav, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const filteredNav = useMemo(() => filterNav(userRole), [userRole]);
  const activeSection = sectionOf(active);
  const pageLabel = usePageLabel(active);

  const quickItems = useMemo(() => {
    return filteredNav
      .map(item => QUICK_MAP[item.id])
      .filter(Boolean)
      .slice(0, 4);
  }, [filteredNav]);

  const navigate = (id) => {
    onNav(id);
    setMenuOpen(false);
  };

  return (
    <>
      {/* Top header */}
      <header className="mobile-header">
        <button
          onClick={() => setMenuOpen(true)}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--mut)] hover:bg-black/5 transition-colors"
          aria-label="Open menu"
        >
          <Menu size={20} strokeWidth={2} />
        </button>

        <div className="flex items-center gap-2.5 overflow-hidden">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--grad)' }}
          >
            <ShieldCheck size={15} color="#fff" strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <span
              className="font-display font-black text-base tracking-tight block truncate"
              style={{
                background: 'var(--grad)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              SHRAMIK
            </span>
            <p className="text-[10px] font-bold text-[var(--mut)] leading-none truncate">
              {pageLabel}
            </p>
          </div>
        </div>

        <div className="w-9" /> {/* balance the hamburger */}
      </header>

      {/* Full navigation drawer */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="left"
          className="w-[280px] p-0 bg-white/85 backdrop-blur-xl border-r border-[var(--divider)] flex flex-col"
        >
          <SheetHeader className="border-b border-[var(--divider)] p-4">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--grad)' }}
              >
                <ShieldCheck size={17} color="#fff" strokeWidth={2.5} />
              </div>
              <SheetTitle className="font-display font-black text-lg tracking-tight text-[var(--ink)]">
                SHRAMIK
              </SheetTitle>
            </div>
          </SheetHeader>

          <nav className="flex flex-col gap-0.5 p-3 overflow-y-auto flex-1">
            {filteredNav.map((item) => {
              const Icon = item.icon;
              const hasChildren = !!item.children;
              const isSection = activeSection === item.id;

              if (hasChildren) {
                return (
                  <div key={item.id}>
                    <div
                      className={cn(
                        'mobile-nav-item text-[var(--mut)] cursor-default',
                        isSection && 'text-[var(--ink)] bg-black/[0.04]'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Icon size={18} strokeWidth={2} />
                        <span className="font-semibold text-sm">{item.label}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-0.5 pl-3 mt-0.5">
                      {item.children.map((child) => {
                        const ChildIcon = child.icon;
                        return (
                          <button
                            key={child.id}
                            onClick={() => navigate(child.id)}
                            className={cn(
                              'mobile-nav-item mobile-nav-sub',
                              active === child.id && 'active'
                            )}
                          >
                            <ChildIcon size={16} strokeWidth={2} />
                            <span>{child.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item.id)}
                  className={cn(
                    'mobile-nav-item',
                    (active === item.id || isSection) && 'active'
                  )}
                >
                  <Icon size={18} strokeWidth={2} />
                  <span className="font-semibold text-sm">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="border-t border-[var(--divider)] p-3">
            <button
              onClick={() => {
                setMenuOpen(false);
                onLogout();
              }}
              className="mobile-nav-item text-[var(--mut)] hover:text-red-500"
            >
              <LogOut size={18} strokeWidth={2} />
              <span className="font-semibold text-sm">Logout</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Bottom quick nav */}
      <nav className="mobile-bottom-nav">
        {quickItems.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id || activeSection === parentIdFor(item.id);
          return (
            <button
              key={item.id}
              onClick={() => onNav(item.id)}
              className={cn('mobile-bottom-tab', isActive && 'active')}
            >
              <Icon size={20} strokeWidth={2} />
              <span className="text-[10px] font-semibold mt-0.5">{item.label}</span>
            </button>
          );
        })}
        <button
          onClick={() => setMenuOpen(true)}
          className={cn('mobile-bottom-tab', menuOpen && 'active')}
        >
          <MoreHorizontal size={20} strokeWidth={2} />
          <span className="text-[10px] font-semibold mt-0.5">Menu</span>
        </button>
      </nav>
    </>
  );
}
