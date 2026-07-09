import React, { useState, useMemo } from 'react';
import { cn } from '../lib/utils';
import {
  LayoutDashboard,
  HardHat,
  UserCheck,
  Briefcase,
  BarChart2,
  Settings,
  LogOut,
  ShieldCheck,
  ChevronDown,
  ClipboardCheck,
  Users,
  PanelLeftClose,
  PanelLeftOpen,
  Wallet,
  BadgeCheck,
  Banknote,
  ScrollText,
} from 'lucide-react';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  {
    id: 'workers',
    label: 'Workers',
    icon: HardHat,
    children: [
      { id: 'workers-manage',  label: 'Manage',  icon: Users },
      { id: 'workers-approve', label: 'Approve', icon: ClipboardCheck },
    ],
  },
  {
    id: 'hirers',
    label: 'Hirers',
    icon: UserCheck,
    children: [
      { id: 'hirers-manage',  label: 'Manage',  icon: Users },
      { id: 'hirers-approve', label: 'Approve', icon: ClipboardCheck },
    ],
  },
  {
    id: 'payments',
    label: 'Payments',
    icon: Wallet,
    children: [
      { id: 'payments-verification', label: 'Verification', icon: BadgeCheck },
      { id: 'payments-settlements',  label: 'Settlements',   icon: Banknote },
    ],
  },
  { id: 'jobs',      label: 'Job Postings', icon: Briefcase },
  { id: 'analytics', label: 'Analytics',    icon: BarChart2 },
  { id: 'users',     label: 'Admin Users',  icon: Users },
  { id: 'logs',      label: 'Logs',         icon: ScrollText },
  { id: 'settings',  label: 'Settings',     icon: Settings },
];

// Maps the current page (including dynamic detail routes like
// `worker-detail/<id>`, which don't correspond to any nav item id) back to
// the nav section it logically belongs to, so that section stays
// highlighted/expanded even when viewing a page reached by drilling in
// (e.g. Manage Workers → a worker's row → worker-detail/<id>).
const sectionOf = (page) => {
  if (!page) return null;
  if (page.startsWith('workers') || page.startsWith('worker-detail/')) return 'workers';
  if (page.startsWith('hirers')  || page.startsWith('hirer-detail/'))  return 'hirers';
  if (page.startsWith('payments')) return 'payments';
  if (page === 'jobs' || page.startsWith('job-detail/')) return 'jobs';
  return page;
};

export default function Sidebar({ active, userRole, onNav, onLogout, collapsed, onToggleCollapse }) {
  const filteredNav = useMemo(() => {
    if (userRole === 'verification_officer') {
      return NAV.filter(item => ['workers', 'hirers'].includes(item.id));
    }
    if (userRole === 'finance_admin') {
      return NAV.filter(item => ['payments', 'jobs'].includes(item.id));
    }
    return NAV;
  }, [userRole]);

  const activeSection = sectionOf(active);

  // Tracks sections the user has manually expanded/collapsed. The section
  // containing the current page is always shown open regardless (see
  // `isOpen` below) — this only needs to remember state for sections the
  // user opened that aren't the active one.
  const [openMenus, setOpenMenus] = useState({});

  const toggleMenu = (id) => {
    if (collapsed) {
      // Expand sidebar first, then open the menu
      onToggleCollapse();
      setOpenMenus({ [id]: true });
    } else {
      setOpenMenus(prev => ({ ...prev, [id]: !prev[id] }));
    }
  };

  const isChildActive = (item) => !!item.children && activeSection === item.id;

  return (
    <aside
      className="sidebar"
      style={{ width: collapsed ? 64 : 240 }}
    >
      {/* Brand + collapse toggle */}
      <div className="flex items-center border-b border-[var(--divider)]" style={{ minHeight: 68, padding: collapsed ? '0 12px' : '0 16px', gap: 10 }}>
        {/* Logo icon — always visible */}
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--grad)' }}
        >
          <ShieldCheck size={16} color="#fff" strokeWidth={2.5} />
        </div>

        {/* Brand text — hidden when collapsed */}
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <span
              className="font-display font-black text-base tracking-tight block"
              style={{ background: 'var(--grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
            >
              SHRAMIK
            </span>
            <p className="text-[10px] font-bold text-[var(--mut)] leading-none mt-0.5">Admin Console</p>
          </div>
        )}

        {/* Toggle button */}
        <button
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[var(--mut)] hover:text-[var(--ink)] hover:bg-black/5 transition-colors cursor-pointer"
          style={{ marginLeft: collapsed ? 0 : 'auto' }}
        >
          {collapsed
            ? <PanelLeftOpen size={15} strokeWidth={2} />
            : <PanelLeftClose size={15} strokeWidth={2} />
          }
        </button>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 mt-3 flex-grow overflow-hidden">
        {filteredNav.map((item) => {
          const Icon = item.icon;
          const hasChildren = !!item.children;
          const childActive = isChildActive(item);
          const isOpen = !collapsed && (openMenus[item.id] || childActive);

          if (hasChildren) {
            return (
              <div key={item.id}>
                <button
                  onClick={() => toggleMenu(item.id)}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    'nav-item w-full',
                    collapsed ? 'justify-center px-0 mx-auto' : 'justify-between',
                    childActive && !collapsed && 'text-[var(--ink)] bg-black/[0.04]',
                    childActive && collapsed && 'text-[var(--accent)]',
                  )}
                  style={collapsed ? { width: 40, padding: '10px 0' } : {}}
                >
                  <div className="flex items-center gap-3">
                    <Icon size={17} strokeWidth={2} />
                    {!collapsed && <span>{item.label}</span>}
                  </div>
                  {!collapsed && (
                    <ChevronDown
                      size={14}
                      strokeWidth={2.5}
                      className={cn('transition-transform duration-200', isOpen && 'rotate-180')}
                    />
                  )}
                </button>

                {/* Children — only shown when expanded */}
                {!collapsed && (
                  <div
                    className="overflow-hidden transition-all duration-200"
                    style={{ maxHeight: isOpen ? `${item.children.length * 44}px` : 0, opacity: isOpen ? 1 : 0 }}
                  >
                    {item.children.map((child) => {
                      const ChildIcon = child.icon;
                      return (
                        <button
                          key={child.id}
                          onClick={() => onNav(child.id)}
                          className={cn('nav-item nav-sub-item', active === child.id && 'active')}
                        >
                          <ChildIcon size={15} strokeWidth={2} />
                          <span>{child.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          return (
            <button
              key={item.id}
              onClick={() => onNav(item.id)}
              title={collapsed ? item.label : undefined}
              className={cn(
                'nav-item',
                collapsed ? 'justify-center mx-auto px-0' : '',
                (active === item.id || activeSection === item.id) && 'active',
              )}
              style={collapsed ? { width: 40, padding: '10px 0' } : {}}
            >
              <Icon size={17} strokeWidth={2} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="border-t border-[var(--divider)] pt-2 mt-2">
        <button
          onClick={onLogout}
          title={collapsed ? 'Logout' : undefined}
          className={cn(
            'nav-item text-[var(--mut)] hover:text-red-500',
            collapsed ? 'justify-center mx-auto px-0' : '',
          )}
          style={collapsed ? { width: 40, padding: '10px 0' } : {}}
        >
          <LogOut size={17} strokeWidth={2} />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
