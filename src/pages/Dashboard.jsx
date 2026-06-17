import React from 'react';
import { TrendingUp, Users, Briefcase, IndianRupee } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';

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

const RECENT = [
  { name: 'Ramu Kumar',    skill: 'Mason',       location: 'Gurugram', status: 'Verified',  date: '17 Jun' },
  { name: 'Sunil Yadav',   skill: 'Painter',     location: 'Noida',    status: 'Pending',   date: '17 Jun' },
  { name: 'Akbar Ali',     skill: 'Electrician', location: 'Delhi',    status: 'Verified',  date: '16 Jun' },
  { name: 'Mohan Lal',     skill: 'Plumber',     location: 'Faridabad',status: 'Rejected',  date: '16 Jun' },
  { name: 'Priya Sharma',  skill: 'Domestic',    location: 'Gurugram', status: 'Verified',  date: '15 Jun' },
];

const STATUS_BADGE = {
  Verified: 'badge badge-green',
  Pending:  'badge badge-orange',
  Rejected: 'badge badge-red',
};

export default function Dashboard() {
  return (
    <div className="flex flex-col gap-8">
      {/* Page title */}
      <div>
        <h1 className="font-display font-black text-3xl tracking-tight text-[var(--ink)]">
          Dashboard
        </h1>
        <p className="text-sm text-[var(--mut)] font-semibold mt-1">
          Platform overview · Last updated just now
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {STATS.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="stat-card glass">
              <div className="flex items-center justify-between">
                <span className="label">{s.label}</span>
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: `${s.color}18` }}
                >
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
        {/* Registrations bar chart */}
        <div className="glass-card rounded-2xl p-6">
          <h2 className="font-display font-bold text-lg text-[var(--ink)] mb-1">
            Weekly Registrations
          </h2>
          <p className="text-xs text-[var(--mut)] font-semibold mb-5">Workers vs Hirers</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={WEEKLY} barSize={12} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(20,16,28,0.06)" />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: 'var(--mut)', fontWeight: 600 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--mut)' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid rgba(20,16,28,0.08)', background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)' }}
                labelStyle={{ fontWeight: 700, fontSize: 13 }}
              />
              <Bar dataKey="workers" name="Workers" fill="#E5397B" radius={[6,6,0,0]} />
              <Bar dataKey="hirers"  name="Hirers"  fill="#7A3BFF" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Jobs line chart */}
        <div className="glass-card rounded-2xl p-6">
          <h2 className="font-display font-bold text-lg text-[var(--ink)] mb-1">
            Job Postings
          </h2>
          <p className="text-xs text-[var(--mut)] font-semibold mb-5">New postings per day this week</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={WEEKLY}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(20,16,28,0.06)" />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: 'var(--mut)', fontWeight: 600 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--mut)' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid rgba(20,16,28,0.08)', background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)' }}
              />
              <Line type="monotone" dataKey="workers" name="Jobs" stroke="#FF8A1E" strokeWidth={2.5} dot={{ r: 4, fill: '#FF8A1E' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent workers table */}
      <div className="glass-card rounded-2xl p-6">
        <h2 className="font-display font-bold text-lg text-[var(--ink)] mb-5">
          Recent Worker Registrations
        </h2>
        <div className="overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Skill</th>
                <th>Location</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {RECENT.map((r, i) => (
                <tr key={i}>
                  <td className="font-semibold">{r.name}</td>
                  <td>{r.skill}</td>
                  <td className="text-[var(--mut)]">{r.location}</td>
                  <td>
                    <span className={STATUS_BADGE[r.status] ?? 'badge badge-gray'}>
                      {r.status}
                    </span>
                  </td>
                  <td className="text-[var(--mut)]">{r.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
