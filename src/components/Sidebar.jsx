import React, { useState } from 'react';
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
  { id: 'hirers',    label: 'Hirers',       icon: UserCheck },
  { id: 'jobs',      label: 'Job Postings', icon: Briefcase },
  { id: 'analytics', label: 'Analytics',    icon: BarChart2 },
  { id: 'settings',  label: 'Settings',     icon: Settings },
];

export default function Sidebar({ active, onNav, onLogout }) {
  // Track which dropdowns are open
  const [openMenus, setOpenMenus] = useState(() => {
    // Auto-open the workers dropdown if the active page is a child
    if (active?.startsWith('workers')) return { workers: true };
    return {};
  });

  const toggleMenu = (id) => {
    setOpenMenus(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const isChildActive = (item) => {
    if (!item.children) return false;
    return item.children.some(c => c.id === active);
  };

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-6 py-5 border-b border-[var(--divider)]">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: 'var(--grad)' }}
        >
          <ShieldCheck size={16} color="#fff" strokeWidth={2.5} />
        </div>
        <div>
          <span
            className="font-display font-black text-base tracking-tight"
            style={{
              background: 'var(--grad)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            SHRAMIK
          </span>
          <p className="text-[10px] font-bold text-[var(--mut)] leading-none mt-0.5">
            Admin Console
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 mt-4 flex-grow">
        {NAV.map((item) => {
          const Icon = item.icon;
          const hasChildren = !!item.children;
          const isOpen = openMenus[item.id] || isChildActive(item);

          if (hasChildren) {
            return (
              <div key={item.id}>
                {/* Parent button */}
                <button
                  onClick={() => toggleMenu(item.id)}
                  className={cn(
                    'nav-item w-full justify-between',
                    isChildActive(item) && 'text-[var(--ink)]'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Icon size={17} strokeWidth={2} />
                    <span>{item.label}</span>
                  </div>
                  <ChevronDown
                    size={14}
                    strokeWidth={2.5}
                    className={cn(
                      'transition-transform duration-200',
                      isOpen && 'rotate-180'
                    )}
                  />
                </button>

                {/* Children */}
                <div
                  className="overflow-hidden transition-all duration-200"
                  style={{
                    maxHeight: isOpen ? `${item.children.length * 44}px` : '0px',
                    opacity: isOpen ? 1 : 0,
                  }}
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
              </div>
            );
          }

          return (
            <button
              key={item.id}
              onClick={() => onNav(item.id)}
              className={cn('nav-item', active === item.id && 'active')}
            >
              <Icon size={17} strokeWidth={2} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Logout */}
      <button onClick={onLogout} className="nav-item text-[var(--mut)] mt-2">
        <LogOut size={17} strokeWidth={2} />
        <span>Logout</span>
      </button>
    </aside>
  );
}
