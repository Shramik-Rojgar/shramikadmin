import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryKeys } from '../lib/queryKeys';
import {
  Briefcase, Search, Filter, RefreshCw, Loader2,
  Download, CheckCircle2, AlertTriangle, Play, XCircle, UserCheck, Clock
} from 'lucide-react';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';
import { cn } from '@/lib/utils';

const FETCH_LIMIT = 500;

const fmtMoney = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtDate  = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const hirerName = (h) => h ? ([h.first_name, h.last_name].filter(Boolean).join(' ') || h.company_name || '—') : '—';

// Status color map for Job status
const STATUS_COLORS = {
  hiring: { bg: 'bg-[#FF8A1E]/10 text-[#FF8A1E]', dot: '#FF8A1E', label: '🟡 Hiring' },
  ongoing: { bg: 'bg-[#16B364]/10 text-[#16B364]', dot: '#16B364', label: '🟢 Ongoing' },
  completed: { bg: 'bg-[#7A3BFF]/10 text-[#7A3BFF]', dot: '#7A3BFF', label: '🔵 Completed' },
  cancelled: { bg: 'bg-[#C91D5E]/10 text-[#C91D5E]', dot: '#C91D5E', label: '🔴 Cancelled' },
};

const th = 'h-auto py-3 px-4 text-[11px] font-extrabold uppercase tracking-wider text-[var(--mut)]';
const td = 'px-4 py-3.5 text-[var(--mut)] text-xs font-semibold';
const tdStrong = 'px-4 py-3.5 font-semibold text-[var(--ink)] text-sm';

export default function Jobs({ onNav }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedJobs, setSelectedJobs] = useState([]);
  const [acting, setActing] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [escrowFilter, setEscrowFilter] = useState('all');
  const [paymentPendingFilter, setPaymentPendingFilter] = useState('all'); // all, pending
  const [cityFilter, setCityFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dateRangeFilter, setDateRangeFilter] = useState('all'); // all, 7d, 30d, 90d

  // Fetch jobs (cached — see src/lib/queryClient.js)
  const { data: jobs = [], isLoading: loading, refetch, isFetching } = useQuery({
    queryKey: queryKeys.jobs,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('*, hirers(*)')
        .order('created_at', { ascending: false })
        .limit(FETCH_LIMIT);
      if (error) throw error;
      return data ?? [];
    },
  });
  const load = () => refetch();

  // Derived lookup lists for filters
  const cities = useMemo(() => [...new Set(jobs.map(j => j.city).filter(Boolean))].sort(), [jobs]);
  const states = useMemo(() => [...new Set(jobs.map(j => j.state).filter(Boolean))].sort(), [jobs]);
  const categories = useMemo(() => [...new Set(jobs.map(j => j.category).filter(Boolean))].sort(), [jobs]);

  // Date range filter helper
  const withinRange = (iso, range) => {
    if (!range || range === 'all') return true;
    if (!iso) return false;
    const daysMap = { '7d': 7, '30d': 30, '90d': 90 };
    const days = daysMap[range];
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return new Date(iso).getTime() >= cutoff;
  };

  // Main list filters
  const filteredJobs = useMemo(() => {
    return jobs.filter(j => {
      // Search matches
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const hirer = hirerName(j.hirers).toLowerCase();
        const company = (j.company_name || '').toLowerCase();
        const phone = (j.contact_phone || '').toLowerCase();
        const city = (j.city || '').toLowerCase();
        const category = (j.category || '').toLowerCase();
        const title = (j.title || '').toLowerCase();
        const jobIdStr = (j.job_id || '').toLowerCase();

        if (
          !jobIdStr.includes(q) &&
          !title.includes(q) &&
          !hirer.includes(q) &&
          !company.includes(q) &&
          !phone.includes(q) &&
          !city.includes(q) &&
          !category.includes(q)
        ) {
          return false;
        }
      }

      // Status filters
      if (statusFilter !== 'all' && j.status !== statusFilter) return false;
      if (escrowFilter !== 'all' && j.escrow_status !== escrowFilter) return false;
      if (paymentPendingFilter === 'pending' && j.escrow_status !== 'pending') return false;
      if (cityFilter !== 'all' && j.city !== cityFilter) return false;
      if (stateFilter !== 'all' && j.state !== stateFilter) return false;
      if (categoryFilter !== 'all' && j.category !== categoryFilter) return false;
      if (!withinRange(j.created_at, dateRangeFilter)) return false;

      return true;
    });
  }, [jobs, search, statusFilter, escrowFilter, paymentPendingFilter, cityFilter, stateFilter, categoryFilter, dateRangeFilter]);

  // Dashboard KPI sums
  const kpis = useMemo(() => {
    const total = jobs.length;
    const hiring = jobs.filter(j => j.status === 'hiring').length;
    const ongoing = jobs.filter(j => j.status === 'ongoing').length;
    const completed = jobs.filter(j => j.status === 'completed').length;
    const cancelled = jobs.filter(j => j.status === 'cancelled').length;
    const escrowPending = jobs.filter(j => j.escrow_status === 'pending').length;
    const escrowFunded = jobs.filter(j => j.escrow_status === 'funded').length;

    return { total, hiring, ongoing, completed, cancelled, escrowPending, escrowFunded };
  }, [jobs]);

  // Bulk Actions
  const handleBulkAction = async (actionType) => {
    if (selectedJobs.length === 0) return;
    setActing(true);
    if (actionType === 'cancel') {
      const confirmCancel = window.confirm(`Are you sure you want to cancel the ${selectedJobs.length} selected job postings?`);
      if (confirmCancel) {
        await supabase.from('jobs').update({ status: 'cancelled' }).in('id', selectedJobs);
      }
    } else if (actionType === 'complete') {
      await supabase.from('jobs').update({ status: 'completed' }).in('id', selectedJobs);
    }
    selectedJobs.forEach(id => queryClient.invalidateQueries({ queryKey: queryKeys.job(id) }));
    setSelectedJobs([]);
    load();
    setActing(false);
  };

  // Toggle selection
  const handleSelectJob = (id) => {
    setSelectedJobs(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSelectAll = () => {
    if (selectedJobs.length === filteredJobs.length) {
      setSelectedJobs([]);
    } else {
      setSelectedJobs(filteredJobs.map(j => j.id));
    }
  };

  // Export actions
  const exportToCSV = (dataToExport) => {
    const headers = ['Job ID', 'Title', 'Hirer', 'Company', 'City', 'Workers Required', 'Workers Selected', 'Escrow', 'Status', 'Created At'];
    const csvRows = [headers.join(',')];

    dataToExport.forEach(j => {
      const row = [
        j.job_id,
        `"${j.title.replace(/"/g, '""')}"`,
        `"${hirerName(j.hirers).replace(/"/g, '""')}"`,
        `"${(j.company_name || '').replace(/"/g, '""')}"`,
        j.city,
        j.workers_required,
        j.selected_workers_count,
        j.escrow_amount,
        j.status,
        j.created_at
      ];
      csvRows.push(row.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Job_Postings_Report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportSelectedCSV = () => {
    const list = jobs.filter(j => selectedJobs.includes(j.id));
    exportToCSV(list);
  };

  const exportAllCSV = () => {
    exportToCSV(filteredJobs);
  };

  // Calculate Recharts Analytics
  const analyticsData = useMemo(() => {
    // 1. Jobs by Category
    const catMap = {};
    // 2. Jobs by State
    const stateMap = {};
    // 3. Daily Job Posts
    const dailyMap = {};
    let totalWage = 0;
    let totalWorkersRequired = 0;

    jobs.forEach(j => {
      catMap[j.category] = (catMap[j.category] || 0) + 1;
      stateMap[j.state] = (stateMap[j.state] || 0) + 1;

      const dateKey = fmtDate(j.created_at);
      dailyMap[dateKey] = (dailyMap[dateKey] || 0) + 1;

      totalWage += Number(j.wage_amount || 0);
      totalWorkersRequired += Number(j.workers_required || 0);
    });

    const categoriesChart = Object.entries(catMap).map(([name, value]) => ({ name, value })).slice(0, 8);
    const statesChart = Object.entries(stateMap).map(([name, value]) => ({ name, value })).slice(0, 8);

    // Chronological daily posts sorted
    const dailyPostsChart = Object.entries(dailyMap)
      .map(([date, count]) => ({ date, count }))
      .slice(-10);

    const averageWage = jobs.length > 0 ? (totalWage / jobs.length) : 0;
    const averageWorkers = jobs.length > 0 ? (totalWorkersRequired / jobs.length) : 0;

    return { categoriesChart, statesChart, dailyPostsChart, averageWage, averageWorkers };
  }, [jobs]);

  // COLORS for pie chart slices
  const COLORS = ['#7A3BFF', '#FF8A1E', '#16B364', '#C91D5E', '#00C49F', '#FFBB28', '#FF8042', '#0088FE'];

  return (
    <div className="flex flex-col gap-8 pb-10">

      {/* Header & Export Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-black text-3xl tracking-tight text-[var(--ink)]">Job Postings</h1>
          <p className="text-sm text-[var(--mut)] font-semibold mt-1">Manage and verify all jobs, verify escrows, and monitor labor assignments</p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={load}
            className="glass rounded-xl px-4 py-2 h-auto gap-2 text-sm font-semibold text-[var(--mut)] hover:text-[var(--ink)]"
          >
            <RefreshCw size={14} className={cn((loading || isFetching) && 'animate-spin')} />
            Refresh
          </Button>

          <Button
            onClick={exportAllCSV}
            className="gap-2 rounded-xl px-4 py-2 h-auto text-sm font-semibold border-transparent"
            style={{ background: 'var(--grad)', color: '#fff' }}
          >
            <Download size={14} /> Export Report (CSV)
          </Button>
        </div>
      </div>

      {/* 1. Dashboard Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
        <StatCard label="Total Jobs" value={kpis.total} icon={Briefcase} color="#7A3BFF" />
        <StatCard label="Hiring" value={kpis.hiring} icon={Clock} color="#FF8A1E" />
        <StatCard label="Ongoing" value={kpis.ongoing} icon={Play} color="#16B364" />
        <StatCard label="Completed" value={kpis.completed} icon={CheckCircle2} color="#7A3BFF" />
        <StatCard label="Cancelled" value={kpis.cancelled} icon={XCircle} color="#C91D5E" />
        <StatCard label="Escrow Pending" value={kpis.escrowPending} icon={AlertTriangle} color="#FF8A1E" />
        <StatCard label="Escrow Funded" value={kpis.escrowFunded} icon={UserCheck} color="#16B364" />
      </div>

      {/* Search & Filters */}
      <div className="glass-card rounded-2xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-[var(--divider)] pb-3">
          <div className="flex items-center gap-2">
            <Filter size={15} className="text-[var(--mut)]" />
            <h2 className="font-display font-bold text-sm uppercase tracking-wider text-[var(--ink)]">Search & Filters</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {/* Search Box */}
          <div className="relative col-span-1 sm:col-span-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mut)]" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by Job ID, Hirer, Company, Phone, City, Category…"
              className="h-9 rounded-xl pl-8 glass border-0 text-xs font-semibold"
            />
          </div>

          {/* Filters Select */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="h-9 rounded-xl glass border-0 px-3 text-xs font-bold uppercase tracking-wider text-[var(--mut)] cursor-pointer outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="hiring">🟡 Hiring</option>
            <option value="ongoing">🟢 Ongoing</option>
            <option value="completed">🔵 Completed</option>
            <option value="cancelled">🔴 Cancelled</option>
          </select>

          <select
            value={escrowFilter}
            onChange={e => setEscrowFilter(e.target.value)}
            className="h-9 rounded-xl glass border-0 px-3 text-xs font-bold uppercase tracking-wider text-[var(--mut)] cursor-pointer outline-none"
          >
            <option value="all">All Escrow Statuses</option>
            <option value="pending">Escrow Pending</option>
            <option value="funded">Escrow Funded</option>
            <option value="released">Escrow Released</option>
            <option value="refunded">Escrow Refunded</option>
          </select>

          <select
            value={paymentPendingFilter}
            onChange={e => setPaymentPendingFilter(e.target.value)}
            className="h-9 rounded-xl glass border-0 px-3 text-xs font-bold uppercase tracking-wider text-[var(--mut)] cursor-pointer outline-none"
          >
            <option value="all">All Payments</option>
            <option value="pending">Payment Pending</option>
          </select>

          <select
            value={dateRangeFilter}
            onChange={e => setDateRangeFilter(e.target.value)}
            className="h-9 rounded-xl glass border-0 px-3 text-xs font-bold uppercase tracking-wider text-[var(--mut)] cursor-pointer outline-none"
          >
            <option value="all">All Time</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>

          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="h-9 rounded-xl glass border-0 px-3 text-xs font-bold uppercase tracking-wider text-[var(--mut)] cursor-pointer outline-none"
          >
            <option value="all">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            value={stateFilter}
            onChange={e => setStateFilter(e.target.value)}
            className="h-9 rounded-xl glass border-0 px-3 text-xs font-bold uppercase tracking-wider text-[var(--mut)] cursor-pointer outline-none"
          >
            <option value="all">All States</option>
            {states.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select
            value={cityFilter}
            onChange={e => setCityFilter(e.target.value)}
            className="h-9 rounded-xl glass border-0 px-3 text-xs font-bold uppercase tracking-wider text-[var(--mut)] cursor-pointer outline-none"
          >
            <option value="all">All Cities</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Bulk Actions Header */}
      {selectedJobs.length > 0 && (
        <div className="flex items-center justify-between bg-white/70 glass border border-[var(--divider)] rounded-xl p-3.5 px-5">
          <span className="text-xs font-bold text-[var(--ink)]">
            Selected <strong className="text-[var(--accent)]">{selectedJobs.length}</strong> items
          </span>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={exportSelectedCSV}
              className="gap-1.5 h-8 font-semibold text-xs border-[var(--input-border)] text-[var(--mut)]"
            >
              <Download size={12} /> Export Selected
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleBulkAction('cancel')}
              disabled={acting}
              className="gap-1.5 h-8 font-semibold text-xs"
            >
              <XCircle size={12} /> Cancel Selected
            </Button>
            <Button
              size="sm"
              onClick={() => handleBulkAction('complete')}
              disabled={acting}
              className="gap-1.5 h-8 font-semibold text-xs bg-[var(--green-soft)] text-[var(--green)] hover:bg-[#c8f0d8]"
            >
              <CheckCircle2 size={12} /> Mark Completed
            </Button>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-[var(--mut)]">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm font-semibold">Loading job postings…</span>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <p className="text-[var(--mut)] font-semibold text-sm">No job postings found.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--divider)] hover:bg-transparent">
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={selectedJobs.length === filteredJobs.length}
                    onChange={handleSelectAll}
                    className="rounded border-[var(--input-border)]"
                  />
                </TableHead>
                <TableHead className={th}>Job ID</TableHead>
                <TableHead className={th}>Title</TableHead>
                <TableHead className={th}>Hirer</TableHead>
                <TableHead className={th}>Location</TableHead>
                <TableHead className={th}>Workers</TableHead>
                <TableHead className={th}>Escrow</TableHead>
                <TableHead className={th}>Status</TableHead>
                <TableHead className={th}>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredJobs.map(j => {
                const badge = STATUS_COLORS[j.status] ?? { bg: 'bg-gray-100 text-gray-800', label: j.status };
                return (
                  <TableRow
                    key={j.id}
                    onClick={() => onNav?.(`job-detail/${j.id}`)}
                    className="border-[var(--divider)] hover:bg-black/[0.015] cursor-pointer"
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedJobs.includes(j.id)}
                        onChange={() => handleSelectJob(j.id)}
                        onClick={e => e.stopPropagation()}
                        className="rounded border-[var(--input-border)]"
                      />
                    </TableCell>
                    <TableCell className={tdStrong}>{j.job_id}</TableCell>
                    <TableCell className={tdStrong}>{j.title}</TableCell>
                    <TableCell className={td}>{hirerName(j.hirers)}</TableCell>
                    <TableCell className={td}>{j.city}</TableCell>
                    <TableCell className={tdStrong}>
                      {j.selected_workers_count} / {j.workers_required}
                    </TableCell>
                    <TableCell className={tdStrong}>{fmtMoney(j.escrow_amount)}</TableCell>
                    <TableCell>
                      <span className={cn('px-2.5 py-1 text-[10px] font-extrabold uppercase rounded-full tracking-wider whitespace-nowrap', badge.bg)}>
                        {badge.label}
                      </span>
                    </TableCell>
                    <TableCell className={td}>{fmtDate(j.created_at)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Analytics (Bottom of page charts) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
        <div className="glass-card rounded-2xl p-6">
          <h2 className="font-display font-bold text-lg text-[var(--ink)] mb-1">Jobs by Category</h2>
          <p className="text-xs text-[var(--mut)] font-semibold mb-5">Job count breakdown across different domains</p>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={analyticsData.categoriesChart}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
              >
                {analyticsData.categoriesChart.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid rgba(20,16,28,0.08)' }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card rounded-2xl p-6">
          <h2 className="font-display font-bold text-lg text-[var(--ink)] mb-1">Jobs by State</h2>
          <p className="text-xs text-[var(--mut)] font-semibold mb-5">Geographic distribution of posted works</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={analyticsData.statesChart} barSize={14}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(20,16,28,0.06)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ borderRadius: 12 }} />
              <Bar dataKey="value" name="Jobs" fill="#7A3BFF" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card rounded-2xl p-6">
          <h2 className="font-display font-bold text-lg text-[var(--ink)] mb-1">Daily Job Postings</h2>
          <p className="text-xs text-[var(--mut)] font-semibold mb-5">Trend analysis of daily post volume</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={analyticsData.dailyPostsChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(20,16,28,0.06)" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ borderRadius: 12 }} />
              <Line type="monotone" dataKey="count" name="Jobs Posted" stroke="#FF8A1E" strokeWidth={2.5} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <h2 className="font-display font-bold text-lg text-[var(--ink)] mb-1">Average Metrics</h2>
            <p className="text-xs text-[var(--mut)] font-semibold mb-5">Overview of average wage and worker requirements</p>
          </div>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="rounded-2xl glass p-4 text-center">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--mut)] block mb-1">Average Wage</span>
              <span className="font-display font-black text-2xl text-[var(--ink)]">{fmtMoney(analyticsData.averageWage)}</span>
              <span className="text-[10px] text-[var(--mut)] block mt-1">per day per worker</span>
            </div>
            <div className="rounded-2xl glass p-4 text-center">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--mut)] block mb-1">Avg Workers Required</span>
              <span className="font-display font-black text-2xl text-[var(--ink)]">{analyticsData.averageWorkers.toFixed(1)}</span>
              <span className="text-[10px] text-[var(--mut)] block mt-1">workers per job posting</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="stat-card glass">
      <div className="flex items-center justify-between">
        <span className="label text-[10px] font-bold text-[var(--mut)] whitespace-nowrap">{label}</span>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}18` }}>
          <Icon size={14} color={color} strokeWidth={2.5} />
        </div>
      </div>
      <span className="value font-display font-black text-xl text-[var(--ink)] mt-1.5">{value}</span>
    </div>
  );
}
