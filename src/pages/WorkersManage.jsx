import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryKeys } from '../lib/queryKeys';
import { useSignedUrlMap } from '../lib/storage';
import {
  Users,
  HardHat,
  MapPin,
  IndianRupee,
  RefreshCw,
  Loader2,
  Eye,
  Search,
  X,
} from 'lucide-react';

const STATUS_BADGE = {
  pending: 'badge badge-orange',
  approved: 'badge badge-green',
  rejected: 'badge badge-red',
};

export default function WorkersManage({ onNav }) {
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState(null);

  // ── Fetch approved workers (cached — see src/lib/queryClient.js) ──
  const { data: workers = [], isLoading: loading, refetch, isFetching } = useQuery({
    queryKey: queryKeys.workersApproved,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('labourers')
        .select('id, labour_id, full_name, mobile_no, date_of_birth, gender, skill_1, skill_2, skill_3, experience_level, daily_wage, city, state, photo_path, government_id_path, status, created_at')
        .eq('status', 'approved')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // The bucket is private: exchange stored paths for short-lived signed URLs.
  const signedUrls = useSignedUrlMap(workers.map(w => w.photo_path));

  const stats = useMemo(() => {
    const cities = new Set(workers.map(w => w.city).filter(Boolean));
    const wages = workers.map(w => w.daily_wage).filter(Boolean);
    const avgWage = wages.length > 0 ? Math.round(wages.reduce((a, b) => a + b, 0) / wages.length) : 0;
    return { total: workers.length, active: workers.length, cities: cities.size, avgWage };
  }, [workers]);

  // ── Filtering ─────────────────────────────────────────────
  const filtered = workers.filter(w => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      w.full_name?.toLowerCase().includes(q) ||
      w.mobile_no?.includes(q) ||
      w.skill_1?.toLowerCase().includes(q) ||
      w.skill_2?.toLowerCase().includes(q) ||
      w.skill_3?.toLowerCase().includes(q) ||
      w.city?.toLowerCase().includes(q) ||
      w.labour_id?.toLowerCase().includes(q)
    );
  });

  const skills = (w) => [w.skill_1, w.skill_2, w.skill_3].filter(Boolean).join(', ');
  const fmt = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

  // ── Stat card config ──────────────────────────────────────
  const STAT_CARDS = [
    { label: 'Total Workers', value: stats.total.toLocaleString('en-IN'), icon: Users, color: '#E5397B' },
    { label: 'Active Workers', value: stats.active.toLocaleString('en-IN'), icon: HardHat, color: '#16B364' },
    { label: 'Cities Covered', value: stats.cities.toLocaleString('en-IN'), icon: MapPin, color: '#7A3BFF' },
    { label: 'Avg. Daily Wage', value: stats.avgWage > 0 ? `₹${stats.avgWage}` : '—', icon: IndianRupee, color: '#FF8A1E' },
  ];

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-black text-3xl tracking-tight text-[var(--ink)]">Manage Workers</h1>
          <p className="text-sm text-[var(--mut)] font-semibold mt-1">Overview and directory of all approved workers</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl glass text-sm font-semibold text-[var(--mut)] hover:text-[var(--ink)] transition-colors cursor-pointer"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {STAT_CARDS.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="stat-card glass">
              <div className="flex items-center justify-between">
                <span className="label">{s.label}</span>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${s.color}18` }}>
                  <Icon size={17} color={s.color} strokeWidth={2.2} />
                </div>
              </div>
              <span className="value">{loading ? '—' : s.value}</span>
            </div>
          );
        })}
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-grow max-w-md">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--mut)]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, mobile, skill, city…"
            className="w-full h-10 pl-10 pr-9 rounded-xl border border-[var(--divider)] bg-white/80 text-sm font-medium text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--rani)]"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--mut)] hover:text-[var(--ink)] cursor-pointer">
              <X size={14} />
            </button>
          )}
        </div>
        <span className="text-xs font-semibold text-[var(--mut)]">
          {loading ? '…' : `${filtered.length} worker${filtered.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Workers table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-[var(--mut)]">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm font-semibold">Loading workers…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <p className="text-[var(--mut)] font-semibold text-sm">
              {search ? 'No workers match your search.' : 'No approved workers found.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Worker</th>
                  <th>Mobile</th>
                  <th>Skills</th>
                  <th>Experience</th>
                  <th>Wage/day</th>
                  <th>City</th>
                  <th>Registered</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(w => (
                  <tr
                    key={w.id}
                    onClick={() => onNav?.(`worker-detail/${w.id}`)}
                    className="cursor-pointer"
                  >
                    {/* Name + avatar */}
                    <td>
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 bg-slate-100 border border-[var(--divider)] cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); w.photo_path && setPreview(w); }}
                          title="View photo"
                        >
                          {signedUrls[w.photo_path]
                            ? <img src={signedUrls[w.photo_path]} className="w-full h-full object-cover" alt={w.full_name} />
                            : <div className="w-full h-full flex items-center justify-center text-xs font-black text-[var(--mut)]">
                              {w.full_name?.[0]?.toUpperCase() ?? '?'}
                            </div>
                          }
                        </div>
                        <div>
                          <p className="font-semibold text-[var(--ink)] text-sm">{w.full_name}</p>
                          {w.labour_id && <p className="text-[10px] text-[var(--mut)] font-semibold">{w.labour_id}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="text-[var(--mut)]">{w.mobile_no}</td>
                    <td className="max-w-[160px]">
                      <span className="text-xs font-semibold text-[var(--ink)]">{skills(w)}</span>
                    </td>
                    <td className="text-[var(--mut)] text-xs font-semibold">{w.experience_level ?? '—'}</td>
                    <td className="font-semibold">₹{w.daily_wage ?? '—'}</td>
                    <td className="text-[var(--mut)] text-xs font-semibold">{w.city ?? '—'}</td>
                    <td className="text-[var(--mut)] text-xs">{fmt(w.created_at)}</td>
                    <td>
                      <span className={STATUS_BADGE[w.status] ?? 'badge badge-gray'}>
                        {w.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Photo preview modal */}
      {preview && (
        <Modal onClose={() => setPreview(null)}>
          <div className="flex flex-col items-center gap-4">
            <img src={signedUrls[preview.photo_path]} alt={preview.full_name}
              className="w-48 h-48 rounded-2xl object-cover border border-[var(--divider)]" />
            <p className="font-display font-bold text-lg text-[var(--ink)]">{preview.full_name}</p>
            <p className="text-sm text-[var(--mut)] font-semibold">{preview.mobile_no}</p>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-card rounded-2xl p-6 w-full max-w-sm z-10">
        <button onClick={onClose}
          className="absolute top-4 right-4 text-[var(--mut)] hover:text-[var(--ink)] cursor-pointer">
          <X size={16} />
        </button>
        {children}
      </div>
    </div>
  );
}
