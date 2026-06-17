import React, { useEffect, useState } from 'react';
import { TrendingUp, Users, Briefcase, IndianRupee, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
import { supabase } from '../lib/supabase';

const STATS = [
  { label: 'Total Workers',   value: '12,480', delta: '+340 this week', icon: Users,        color: '#E5397B' },
  { label: 'Active Hirers',   value: '1,842',  delta: '+58 this week',  icon: Briefcase,    color: '#7A3BFF' },
  { label: 'Jobs Posted',     value: '4,271',  delta: '+192 today',     icon: TrendingUp,   color: '#FF8A1E' },
  { label: 'Wages Processed', value: '₹42.6L', delta: '+₹3.1L today',  icon: IndianRupee,  color: '#16B364' },
];

const WEEKLY = [
  { day: 'Mon', workers: 84, hirers: 22 },
  { day: 'Tue', workers: 97, hirers: 31 },
  { day: 'Wed', workers: 110, hirers: 28 },
  { day: 'Thu', workers: 88, hirers: 19 },
  { day: 'Fri', workers: 124, hirers: 45 },
  { day: 'Sat', workers: 136, hirers: 52 },
  { day: 'Sun', workers: 73, hirers: 17 },
];

const STATUS_BADGE = {
  pending:  'badge badge-orange',
  approved: 'badge badge-green',
  rejected: 'badge badge-red',
};

const fmt = (iso) => iso
  ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
  : '—';

export default function Dashboard() {
  const [recent,  setRecent]  = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('labourers')
      .select('id, full_name, skill_1, status, created_at')
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setRecent(data ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="flex flex-col gap-8">
      {/* Page title */}
      <div>
        <h1 className="font-display font-black text-3xl tracking-tight text-[var(--ink)]">Dashboard</h1>
        <p className="text-sm text-[var(--mut)] font-semibold mt-1">Platform overview · Last updated just now</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {STATS.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="stat-card glass">
              <div className="flex items-center justify-between">
                <span className="label">{s.label}</span>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${s.color}18` }}>
                  <Icon size={17} color={s.color} strokeWidth={2.2} />
                </div>
              </div>
              <span className="value">{s.value}</span>
              <span className="delta">{s.delta}</span>
            </div>
          );
        })}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card rounded-2xl p-6">
          <h2 className="font-display font-bold text-lg text-[var(--ink)] mb-1">Weekly Registrations</h2>
          <p className="text-xs text-[var(--mut)] font-semibold mb-5">Workers vs Hirers</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={WEEKLY} barSize={12} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(20,16,28,0.06)" />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: 'var(--mut)', fontWeight: 600 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--mut)' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid rgba(20,16,28,0.08)', background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)' }} labelStyle={{ fontWeight: 700, fontSize: 13 }} />
              <Bar dataKey="workers" name="Workers" fill="#E5397B" radius={[6,6,0,0]} />
              <Bar dataKey="hirers"  name="Hirers"  fill="#7A3BFF" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card rounded-2xl p-6">
          <h2 className="font-display font-bold text-lg text-[var(--ink)] mb-1">Job Postings</h2>
          <p className="text-xs text-[var(--mut)] font-semibold mb-5">New postings per day this week</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={WEEKLY}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(20,16,28,0.06)" />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: 'var(--mut)', fontWeight: 600 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--mut)' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid rgba(20,16,28,0.08)', background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)' }} />
              <Line type="monotone" dataKey="workers" name="Jobs" stroke="#FF8A1E" strokeWidth={2.5} dot={{ r: 4, fill: '#FF8A1E' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent worker registrations — live data */}
      <div className="glass-card rounded-2xl p-6">
        <h2 className="font-display font-bold text-lg text-[var(--ink)] mb-5">
          Recent Worker Registrations
        </h2>

        {loading ? (
          <div className="flex items-center gap-3 py-8 justify-center text-[var(--mut)]">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm font-semibold">Loading…</span>
          </div>
        ) : recent.length === 0 ? (
          <p className="text-sm text-[var(--mut)] font-semibold text-center py-8">No registrations yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Primary Skill</th>
                  <th>Status</th>
                  <th>Registered</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="font-semibold">{r.full_name}</td>
                    <td>{r.skill_1 ?? '—'}</td>
                    <td>
                      <span className={STATUS_BADGE[r.status] ?? 'badge badge-gray'}>
                        {r.status}
                      </span>
                    </td>
                    <td className="text-[var(--mut)]">{fmt(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
