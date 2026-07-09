import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  Users,
  Building2,
  MapPin,
  RefreshCw,
  Loader2,
  Eye,
  Search,
  X,
  User,
} from 'lucide-react';

const STATUS_BADGE = {
  pending: 'badge badge-orange',
  active:  'badge badge-green',
  blocked: 'badge badge-red',
};

export default function HirersManage({ onNav }) {
  const [hirers,  setHirers]  = useState([]);
  const [stats,   setStats]   = useState({ total: 0, individuals: 0, companies: 0, cities: 0 });
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');

  const fetchHirers = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('hirers')
      .select('id, hirer_id, first_name, last_name, mobile_no, email, entity_type, company_name, gst_number, city, state, aadhar_url, is_verified, status, created_at')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setHirers(data);
      const cities       = new Set(data.map(h => h.city).filter(Boolean));
      const individuals  = data.filter(h => h.entity_type === 'Individual').length;
      setStats({
        total:       data.length,
        individuals,
        companies:   data.length - individuals,
        cities:      cities.size,
      });
    }

    setLoading(false);
  }, []);

  useEffect(() => { fetchHirers(); }, [fetchHirers]);

  const filtered = hirers.filter(h => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      h.first_name?.toLowerCase().includes(q) ||
      h.last_name?.toLowerCase().includes(q)  ||
      h.mobile_no?.includes(q)                ||
      h.email?.toLowerCase().includes(q)      ||
      h.company_name?.toLowerCase().includes(q) ||
      h.city?.toLowerCase().includes(q)       ||
      h.hirer_id?.toLowerCase().includes(q)
    );
  });

  const fullName = (h) => `${h.first_name} ${h.last_name}`;
  const fmt = (iso) => iso
    ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
    : '—';

  const STAT_CARDS = [
    { label: 'Total Hirers',   value: stats.total,       icon: Users,     color: '#E5397B' },
    { label: 'Individuals',    value: stats.individuals,  icon: User,      color: '#16B364' },
    { label: 'Companies',      value: stats.companies,    icon: Building2, color: '#7A3BFF' },
    { label: 'Cities Covered', value: stats.cities,       icon: MapPin,    color: '#FF8A1E' },
  ];

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-black text-3xl tracking-tight text-[var(--ink)]">Manage Hirers</h1>
          <p className="text-sm text-[var(--mut)] font-semibold mt-1">Overview and directory of all active hirers</p>
        </div>
        <button
          onClick={fetchHirers}
          className="flex items-center gap-2 px-4 py-2 rounded-xl glass text-sm font-semibold text-[var(--mut)] hover:text-[var(--ink)] transition-colors cursor-pointer"
        >
          <RefreshCw size={14} />
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
              <span className="value">{loading ? '—' : s.value.toLocaleString('en-IN')}</span>
            </div>
          );
        })}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-grow max-w-md">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--mut)]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, mobile, company, city…"
            className="w-full h-10 pl-10 pr-9 rounded-xl border border-[var(--divider)] bg-white/80 text-sm font-medium text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--rani)]"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--mut)] hover:text-[var(--ink)] cursor-pointer">
              <X size={14} />
            </button>
          )}
        </div>
        <span className="text-xs font-semibold text-[var(--mut)]">
          {loading ? '…' : `${filtered.length} hirer${filtered.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-[var(--mut)]">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm font-semibold">Loading hirers…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <p className="text-[var(--mut)] font-semibold text-sm">
              {search ? 'No hirers match your search.' : 'No active hirers found.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Hirer</th>
                  <th>Mobile</th>
                  <th>Email</th>
                  <th>Type</th>
                  <th>Company</th>
                  <th>GST</th>
                  <th>City</th>
                  <th>Registered</th>
                  <th>Status</th>
                  <th>Aadhaar</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(h => (
                  <tr
                    key={h.id}
                    onClick={() => onNav?.(`hirer-detail/${h.id}`)}
                    className="cursor-pointer"
                  >
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex-shrink-0 bg-slate-100 border border-[var(--divider)] flex items-center justify-center">
                          {h.entity_type === 'Individual'
                            ? <User size={15} className="text-[var(--mut)]" />
                            : <Building2 size={15} className="text-[var(--mut)]" />
                          }
                        </div>
                        <div>
                          <p className="font-semibold text-[var(--ink)] text-sm">{fullName(h)}</p>
                          {h.hirer_id && <p className="text-[10px] text-[var(--mut)] font-semibold">{h.hirer_id}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="text-[var(--mut)]">{h.mobile_no}</td>
                    <td className="text-[var(--mut)] text-xs max-w-[160px] truncate">{h.email ?? '—'}</td>
                    <td>
                      <span className="text-xs font-semibold text-[var(--ink)]">{h.entity_type ?? '—'}</span>
                    </td>
                    <td className="text-[var(--mut)] text-xs max-w-[140px] truncate">{h.company_name ?? '—'}</td>
                    <td className="text-[var(--mut)] text-xs font-mono">{h.gst_number ?? '—'}</td>
                    <td className="text-[var(--mut)] text-xs">{h.city ?? '—'}</td>
                    <td className="text-[var(--mut)] text-xs">{fmt(h.created_at)}</td>
                    <td>
                      <span className={STATUS_BADGE[h.status] ?? 'badge badge-gray'}>{h.status}</span>
                    </td>
                    <td>
                      {h.aadhar_url
                        ? <a href={h.aadhar_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-xs font-bold text-[var(--rani)] hover:underline">
                            <Eye size={12} /> View
                          </a>
                        : <span className="text-xs text-[var(--mut)]">—</span>
                      }
                    </td>
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
