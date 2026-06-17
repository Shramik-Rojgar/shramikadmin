import React from 'react';
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
} from 'lucide-react';

const NAV = [
  { id: 'dashboard',  label: 'Dashboard',      icon: LayoutDashboard },
  { id: 'workers',    label: 'Workers',         icon: HardHat },
  { id: 'hirers',     label: 'Hirers',          icon: UserCheck },
  { id: 'jobs',       label: 'Job Postings',    icon: Briefcase },
  { id: 'analytics',  label: 'Analytics',       icon: BarChart2 },
  { id: 'settings',   label: 'Settings',        icon: Settings },
];

export default function Sidebar({ active, onNav, onLogout }) {
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
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNav(id)}
            className={cn('nav-item', active === id && 'active')}
          >
            <Icon size={17} strokeWidth={2} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {/* Logout */}
      <button onClick={onLogout} className="nav-item text-[var(--mut)] mt-2">
        <LogOut size={17} strokeWidth={2} />
        <span>Logout</span>
      </button>
    </aside>
  );
}
