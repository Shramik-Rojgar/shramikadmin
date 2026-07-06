import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  ScrollText, RefreshCw, Loader2, Search, Terminal, ServerCog, AlertTriangle,
} from 'lucide-react';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const FETCH_LIMIT = 500;

const fmtDateTime = (iso) => iso
  ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '—';

const DATE_RANGES = { all: null, '1h': 1, '3h': 3, '24h': 24 };
const DATE_RANGE_LABEL = { all: 'All Time', '1h': 'Last 1 Hour', '3h': 'Last 3 Hours', '24h': 'Last 24 Hours' };
const withinRange = (iso, range) => {
  if (!range || range === 'all') return true;
  if (!iso) return false;
  const cutoff = Date.now() - DATE_RANGES[range] * 60 * 60 * 1000;
  return new Date(iso).getTime() >= cutoff;
};

// Color-code action families for quick scanning
const ACTION_COLOR = (action = '') => {
  if (action.includes('rejected') || action.includes('deleted') || action.includes('deactivated') || action.includes('blocked')) return 'var(--accent)';
  if (action.includes('approved') || action.includes('verified') || action.includes('paid') || action.includes('activated') || action.includes('created')) return 'var(--green)';
  if (action.includes('refund') || action.includes('retried')) return 'var(--violet)';
  return 'var(--saffron)';
};

const th = 'h-auto py-3 px-4 text-[11px] font-extrabold uppercase tracking-wider text-[var(--mut)]';
const td = 'px-4 py-3.5 text-[var(--mut)] text-xs font-semibold';
const tdStrong = 'px-4 py-3.5 font-semibold text-[var(--ink)] text-sm';

export default function Logs() {
  const [tab, setTab] = useState('activity');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display font-black text-3xl tracking-tight text-[var(--ink)]">Logs</h1>
        <p className="text-sm text-[var(--mut)] font-semibold mt-1">Admin activity trail and platform system logs</p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex-col gap-4">
        <TabsList className="h-auto w-fit gap-2 rounded-xl bg-transparent p-0">
          {[
            { id: 'activity', label: 'Activity Logs' },
            { id: 'system',   label: 'System Logs'   },
          ].map(t => (
            <TabsTrigger
              key={t.id}
              value={t.id}
              className="h-auto flex-none rounded-xl px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-[var(--mut)] glass data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:border-transparent"
              style={tab === t.id ? { background: 'var(--grad)' } : {}}
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="activity"><ActivityLogs /></TabsContent>
        <TabsContent value="system"><SystemLogs /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Activity Logs — every admin action, written by src/lib/activityLog.js
// ─────────────────────────────────────────────────────────
function ActivityLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('admin_activity_logs')
      .select('id, admin_id, admin_email, admin_name, action, entity_type, entity_id, description, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(FETCH_LIMIT);

    if (error) {
      // 42P01 = undefined_table (raw pg error) — PGRST205 = PostgREST schema-cache miss.
      // Both mean the migration in supabase/admin_activity_logs.sql hasn't been run yet.
      setTableMissing(
        error.code === '42P01' ||
        error.code === 'PGRST205' ||
        /relation .* does not exist/i.test(error.message) ||
        /could not find the table/i.test(error.message)
      );
      console.error('[admin_activity_logs]', error.message);
      setLogs([]);
    } else {
      setLogs(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const actions = useMemo(() => [...new Set(logs.map(l => l.action))].sort(), [logs]);

  const filtered = useMemo(() => logs.filter(l => {
    const q = search.trim().toLowerCase();
    if (q && !(l.description?.toLowerCase().includes(q) || l.admin_name?.toLowerCase().includes(q) || l.admin_email?.toLowerCase().includes(q) || l.entity_id?.toLowerCase().includes(q))) return false;
    if (actionFilter !== 'all' && l.action !== actionFilter) return false;
    if (!withinRange(l.created_at, dateFilter)) return false;
    return true;
  }), [logs, search, actionFilter, dateFilter]);

  if (tableMissing) {
    return (
      <div className="glass-card rounded-2xl p-10 flex flex-col items-center text-center gap-3">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[rgba(255,138,30,0.12)]">
          <AlertTriangle size={20} className="text-[var(--saffron)]" />
        </div>
        <h3 className="font-display font-bold text-lg text-[var(--ink)]">Activity log table not found</h3>
        <p className="text-sm text-[var(--mut)] font-semibold max-w-md">
          Run <code className="px-1.5 py-0.5 rounded bg-black/5 text-[var(--ink)]">supabase/admin_activity_logs.sql</code> in your
          Supabase SQL editor to create the <code className="px-1.5 py-0.5 rounded bg-black/5 text-[var(--ink)]">admin_activity_logs</code> table,
          then refresh this page.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mut)]" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by admin, entity or description…"
            className="h-9 rounded-xl pl-8 glass border-0 text-sm"
          />
        </div>
        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          className="h-9 rounded-xl glass border-0 px-3 text-xs font-bold uppercase tracking-wider text-[var(--mut)] cursor-pointer outline-none"
        >
          <option value="all">All Actions</option>
          {actions.map(a => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
        </select>
        <select
          value={dateFilter}
          onChange={e => setDateFilter(e.target.value)}
          className="h-9 rounded-xl glass border-0 px-3 text-xs font-bold uppercase tracking-wider text-[var(--mut)] cursor-pointer outline-none"
        >
          {Object.keys(DATE_RANGES).map(k => <option key={k} value={k}>{DATE_RANGE_LABEL[k]}</option>)}
        </select>
        <Button
          variant="ghost"
          onClick={load}
          className="glass rounded-xl px-4 py-2 h-9 gap-2 text-sm font-semibold text-[var(--mut)] hover:text-[var(--ink)] hover:bg-transparent ml-auto"
        >
          <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-[var(--mut)]">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm font-semibold">Loading activity…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <ScrollText size={20} className="text-[var(--mut)]" />
            <p className="text-[var(--mut)] font-semibold text-sm">No activity found.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--divider)] hover:bg-transparent">
                <TableHead className={th}>Admin</TableHead>
                <TableHead className={th}>Action</TableHead>
                <TableHead className={th}>Description</TableHead>
                <TableHead className={th}>Entity</TableHead>
                <TableHead className={th}>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(l => (
                <TableRow key={l.id} className="border-[var(--divider)] hover:bg-black/[0.018]">
                  <TableCell className={tdStrong}>
                    {l.admin_name ?? l.admin_email ?? 'Unknown'}
                    {l.admin_name && <p className="text-[10px] font-semibold text-[var(--mut)]">{l.admin_email}</p>}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className="font-bold capitalize border-transparent whitespace-nowrap"
                      style={{ background: `color-mix(in srgb, ${ACTION_COLOR(l.action)} 14%, transparent)`, color: ACTION_COLOR(l.action) }}
                    >
                      {l.action.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className={td}>{l.description}</TableCell>
                  <TableCell className={td}>{l.entity_type ? `${l.entity_type} · ${l.entity_id ?? '—'}` : '—'}</TableCell>
                  <TableCell className={td}>{fmtDateTime(l.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// System Logs — Supabase auth/API/function logs.
// These live in Supabase's Logflare-backed analytics store and can only be
// read via the Management API using an org-level Personal Access Token —
// a secret that must never ship to the browser. This tab calls a
// `get-system-logs` Edge Function (scaffolded in
// supabase/functions/get-system-logs) which holds that token server-side.
// Until that function is deployed with the right secrets, this tab shows
// a setup notice instead of fabricating data.
// ─────────────────────────────────────────────────────────
function SystemLogs() {
  const [state, setState] = useState('loading'); // loading | ready | unavailable
  const [logs, setLogs] = useState([]);
  const [source, setSource] = useState(null); // which log source is selected
  const [range, setRange] = useState('1h');
  const sources = ['api', 'auth', 'edge-functions', 'postgres'];

  const load = useCallback(async (src, rng) => {
    setState('loading');
    const { data, error } = await supabase.functions.invoke('get-system-logs', {
      body: { source: src ?? 'api', range: rng ?? '1h', limit: 200 },
    });
    if (error || !data) {
      setState('unavailable');
      return;
    }
    setLogs(data.logs ?? []);
    setState('ready');
  }, []);

  useEffect(() => { load(source ?? 'api', range); }, [load, source, range]);

  if (state === 'unavailable') {
    return (
      <div className="glass-card rounded-2xl p-10 flex flex-col items-center text-center gap-3">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[rgba(122,59,255,0.10)]">
          <ServerCog size={20} className="text-[var(--violet)]" />
        </div>
        <h3 className="font-display font-bold text-lg text-[var(--ink)]">System logs need a backend proxy</h3>
        <p className="text-sm text-[var(--mut)] font-semibold max-w-md">
          Auth, API, Edge Function and Postgres logs live in Supabase's Management API, which requires an
          organization-level access token. That token can never be shipped to the browser, so it must be
          held by a server-side Edge Function.
        </p>
        <p className="text-xs text-[var(--mut)] font-semibold max-w-md">
          Deploy the <code className="px-1.5 py-0.5 rounded bg-black/5 text-[var(--ink)]">get-system-logs</code> function
          (scaffolded at <code className="px-1.5 py-0.5 rounded bg-black/5 text-[var(--ink)]">supabase/functions/get-system-logs</code>)
          with <code className="px-1.5 py-0.5 rounded bg-black/5 text-[var(--ink)]">MGMT_ACCESS_TOKEN</code> and
          <code className="px-1.5 py-0.5 rounded bg-black/5 text-[var(--ink)]"> MGMT_PROJECT_REF</code> secrets, then refresh this tab.
        </p>
        <Button
          variant="ghost"
          onClick={() => load(source ?? 'api', range)}
          className="glass rounded-xl px-4 py-2 h-9 gap-2 text-sm font-semibold text-[var(--mut)] hover:text-[var(--ink)] mt-2"
        >
          <RefreshCw size={14} /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {sources.map(s => (
            <button
              key={s}
              onClick={() => setSource(s)}
              className={cn(
                'px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer glass',
                (source ?? 'api') === s ? 'text-white' : 'text-[var(--mut)] hover:text-[var(--ink)]',
              )}
              style={(source ?? 'api') === s ? { background: 'var(--grad)' } : {}}
            >
              {s.replace('-', ' ')}
            </button>
          ))}
        </div>

        <select
          value={range}
          onChange={e => setRange(e.target.value)}
          className="h-9 rounded-xl glass border-0 px-3 text-xs font-bold uppercase tracking-wider text-[var(--mut)] cursor-pointer outline-none"
        >
          <option value="1h">Last 1 Hour</option>
          <option value="3h">Last 3 Hours</option>
          <option value="24h">Last 24 Hours</option>
        </select>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        {state === 'loading' ? (
          <div className="flex items-center justify-center py-20 gap-3 text-[var(--mut)]">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm font-semibold">Loading system logs…</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <Terminal size={20} className="text-[var(--mut)]" />
            <p className="text-[var(--mut)] font-semibold text-sm">No log entries in this window.</p>
          </div>
        ) : (
          <div className="max-h-[520px] overflow-y-auto font-mono text-xs">
            {logs.map((entry, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-2.5 border-b border-[var(--divider)] last:border-0">
                <span className="text-[var(--mut)] whitespace-nowrap">{fmtDateTime(entry.timestamp)}</span>
                <span className={cn('font-bold uppercase', entry.level === 'error' ? 'text-[var(--accent)]' : entry.level === 'warning' ? 'text-[var(--saffron)]' : 'text-[var(--green)]')}>
                  {entry.level ?? 'info'}
                </span>
                <span className="text-[var(--ink)] break-all">{entry.message ?? JSON.stringify(entry)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
