import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { logActivity } from '../lib/activityLog';
import {
  IndianRupee, Wallet, Clock, Undo2, CheckCircle2, RefreshCw, Loader2,
  Search, ExternalLink, RotateCcw, Printer,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const FETCH_LIMIT = 500;

const fmtMoney = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtDate  = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
const hirerName = (h) => h ? ([h.first_name, h.last_name].filter(Boolean).join(' ') || h.company_name || '—') : '—';

const DATE_RANGES = {
  all: null,
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

const withinRange = (iso, range) => {
  if (!range || range === 'all') return true;
  if (!iso) return false;
  const days = DATE_RANGES[range];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return new Date(iso).getTime() >= cutoff;
};

// ── Status color map (covers payments/payouts/refunds/queue) ──
const STATUS_COLOR = {
  pending:                  'var(--saffron)',
  authorized:               'var(--saffron)',
  processing:               'var(--saffron)',
  captured:                 'var(--green)',
  paid:                     'var(--green)',
  completed:                'var(--green)',
  failed:                   'var(--accent)',
  cancelled:                'var(--accent)',
  refunded:                 'var(--violet)',
  awaiting_completion:      'var(--mut)',
  ready_for_settlement:     'var(--saffron)',
  worker_payments_pending:  'var(--violet)',
  refund_pending:           'var(--accent)',
};

const QUEUE_STATUS_LABEL = {
  awaiting_completion:     'Awaiting Completion',
  ready_for_settlement:    'Ready for Settlement',
  worker_payments_pending: 'Worker Payments Pending',
  refund_pending:          'Refund Pending',
  completed:               'Completed',
};

function StatusBadge({ status, label }) {
  const color = STATUS_COLOR[status] ?? 'var(--mut)';
  return (
    <Badge
      className="font-bold capitalize border-transparent whitespace-nowrap"
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
    >
      {label ?? status}
    </Badge>
  );
}

const th = 'h-auto py-3 px-4 text-[11px] font-extrabold uppercase tracking-wider text-[var(--mut)]';
const td = 'px-4 py-3.5 text-[var(--mut)] text-xs font-semibold';
const tdStrong = 'px-4 py-3.5 font-semibold text-[var(--ink)] text-sm';

export default function PaymentsSettlements() {
  const [jobs,       setJobs]       = useState([]);
  const [jobWorkers, setJobWorkers] = useState([]);
  const [payouts,    setPayouts]    = useState([]);
  const [refunds,    setRefunds]    = useState([]);
  const [payments,   setPayments]   = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading,    setLoading]    = useState(true);

  const [tab,    setTab]    = useState('queue');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [cityFilter,   setCityFilter]   = useState('all');
  const [jobFilter,    setJobFilter]    = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [dateFilter,   setDateFilter]   = useState('all');

  const [sheetJobId, setSheetJobId] = useState(null);
  const [refundDialog, setRefundDialog] = useState(null); // { job } | null
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [jobsRes, jwRes, payoutsRes, refundsRes, paymentsRes, attendanceRes] = await Promise.all([
      supabase
        .from('jobs')
        .select('id, job_id, title, city, status, workers_required, escrow_amount, escrow_status, payment_status, actual_total_amount, refunded_amount, wage_amount, created_at, hirer_id, hirers(first_name,last_name,company_name)')
        .order('created_at', { ascending: false })
        .limit(FETCH_LIMIT),
      supabase
        .from('job_workers')
        .select('id, job_id, labourer_id, hirer_id, status, payout_id, payment_status, created_at, labourers(full_name)')
        .limit(FETCH_LIMIT * 4),
      supabase
        .from('worker_payouts')
        .select('id, payout_id, job_worker_id, payment_id, attendance_days, half_days, absent_days, overtime_amount, bonus_amount, deduction_amount, gross_amount, net_amount, payment_status, paid_at, created_at, transaction_reference, payments(payment_method)')
        .order('created_at', { ascending: false })
        .limit(FETCH_LIMIT * 2),
      supabase
        .from('refunds')
        .select('id, refund_id, refund_amount, refund_reason, status, razorpay_refund_id, refunded_at, created_at, job_id, hirer_id, payment_id, hirers(first_name,last_name,company_name), payments(payment_id), jobs(job_id)')
        .order('created_at', { ascending: false })
        .limit(FETCH_LIMIT),
      supabase
        .from('payments')
        .select('id, payment_id, payment_type, amount, currency, payment_method, status, paid_at, created_at, job_id, hirer_id, labourer_id, jobs(job_id,city), hirers(first_name,last_name,company_name), labourers(full_name)')
        .order('created_at', { ascending: false })
        .limit(FETCH_LIMIT),
      supabase
        .from('attendance')
        .select('id, job_worker_id, status, attendance_date')
        .limit(FETCH_LIMIT * 5),
    ]);

    if (jobsRes.error)     console.error('[jobs]', jobsRes.error.message);
    if (jwRes.error)       console.error('[job_workers]', jwRes.error.message);
    if (payoutsRes.error)  console.error('[worker_payouts]', payoutsRes.error.message);
    if (refundsRes.error)  console.error('[refunds]', refundsRes.error.message);
    if (paymentsRes.error) console.error('[payments]', paymentsRes.error.message);
    if (attendanceRes.error) console.error('[attendance]', attendanceRes.error.message);

    setJobs(jobsRes.data ?? []);
    setJobWorkers(jwRes.data ?? []);
    setPayouts(payoutsRes.data ?? []);
    setRefunds(refundsRes.data ?? []);
    setPayments(paymentsRes.data ?? []);
    setAttendance(attendanceRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // reset filters when switching tabs so a stale status filter doesn't hide everything
  useEffect(() => { setStatusFilter('all'); setSearch(''); setJobFilter('all'); }, [tab]);

  // ── Lookup maps ─────────────────────────────────────────
  const jobsById = useMemo(() => Object.fromEntries(jobs.map(j => [j.id, j])), [jobs]);
  const payoutsById = useMemo(() => Object.fromEntries(payouts.map(p => [p.id, p])), [payouts]);
  const jobWorkersByJobId = useMemo(() => {
    const m = {};
    jobWorkers.forEach(w => { (m[w.job_id] ??= []).push(w); });
    return m;
  }, [jobWorkers]);
  const refundsByJobId = useMemo(() => {
    const m = {};
    refunds.forEach(r => { (m[r.job_id] ??= []).push(r); });
    return m;
  }, [refunds]);
  const paymentsByJobId = useMemo(() => {
    const m = {};
    payments.forEach(p => { if (p.job_id) (m[p.job_id] ??= []).push(p); });
    return m;
  }, [payments]);
  const attendanceByWorkerId = useMemo(() => {
    const m = {};
    attendance.forEach(a => { (m[a.job_worker_id] ??= []).push(a); });
    return m;
  }, [attendance]);

  // ── Settlement Queue (one row per job) ─────────────────
  const queueRows = useMemo(() => jobs.map(job => {
    const workers = (jobWorkersByJobId[job.id] ?? []).filter(w => w.status !== 'cancelled');
    const workersWorked = workers.filter(w => w.status === 'completed').length;
    const workerPayouts = workers.map(w => w.payout_id ? payoutsById[w.payout_id] : null);

    // Calculate dynamic escrow based on days and attendance
    let calculatedEscrow = 0;
    workers.forEach(w => {
      const workerAttendance = attendanceByWorkerId[w.id] ?? [];
      let days = 0;
      workerAttendance.forEach(a => {
        if (a.status === 'present') days += 1;
        else if (a.status === 'half_day') days += 0.5;
      });
      calculatedEscrow += days * (Number(job.wage_amount) || 0);
    });

    const displayEscrow = calculatedEscrow > 0 ? calculatedEscrow : (Number(job.escrow_amount) || 0);

    // Dynamic calculations
    const paidAmount = workerPayouts.reduce((s, p) => s + (p?.payment_status === 'paid' ? Number(p.net_amount || 0) : 0), 0);
    const pendingWorkerCount = workers.filter((w, i) => {
      const p = workerPayouts[i];
      return !p || ['pending', 'processing'].includes(p.payment_status);
    }).length;

    const jobRefunds = refundsByJobId[job.id] ?? [];
    const refundTotal = jobRefunds.reduce((s, r) => s + Number(r.refund_amount || 0), 0);
    const refundPending = jobRefunds.some(r => ['pending', 'processing'].includes(r.status));

    let status;
    if (job.status !== 'completed') status = 'awaiting_completion';
    else if (workers.length > 0 && workerPayouts.every(p => !p)) status = 'ready_for_settlement';
    else if (pendingWorkerCount > 0) status = 'worker_payments_pending';
    else if (refundPending) status = 'refund_pending';
    else status = 'completed';

    return {
      job, workers, workersWorked, paidAmount, pendingWorkerCount,
      refundTotal, refundPending, status, displayEscrow,
    };
  }), [jobs, jobWorkersByJobId, payoutsById, refundsByJobId, paymentsByJobId, attendanceByWorkerId]);

  const queueRowsById = useMemo(() => Object.fromEntries(queueRows.map(r => [r.job.id, r])), [queueRows]);

  // ── Worker payout roster (one row per job_worker) ──────
  const payoutRows = useMemo(() => jobWorkers
    .filter(w => w.status !== 'cancelled')
    .map(w => {
      const payout = w.payout_id ? payoutsById[w.payout_id] : null;
      return {
        id: w.id,
        workerName: w.labourers?.full_name ?? '—',
        job: jobsById[w.job_id],
        amount: payout?.net_amount ?? null,
        method: payout?.payments?.payment_method ?? 'bank_transfer',
        status: payout?.payment_status ?? w.payment_status ?? 'pending',
        date: payout?.paid_at ?? payout?.created_at ?? w.created_at,
        payout,
        jobWorker: w,
      };
    }), [jobWorkers, payoutsById, jobsById]);

  // ── Finance overview KPIs ──────────────────────────────
  const kpis = useMemo(() => {
    const totalEscrowReceived = payments
      .filter(p => p.payment_type === 'escrow' && ['captured', 'paid'].includes(p.status))
      .reduce((s, p) => s + Number(p.amount || 0), 0);

    const workersPaid = payouts
      .filter(p => p.payment_status === 'paid')
      .reduce((s, p) => s + Number(p.net_amount || 0), 0);

    const pendingWorkerPayments = payouts
      .filter(p => ['pending', 'processing'].includes(p.payment_status))
      .reduce((s, p) => s + Number(p.net_amount || 0), 0);

    const refundsPending = refunds
      .filter(r => ['pending', 'processing'].includes(r.status))
      .reduce((s, r) => s + Number(r.refund_amount || 0), 0);

    const refundsCompleted = refunds
      .filter(r => r.status === 'completed')
      .reduce((s, r) => s + Number(r.refund_amount || 0), 0);

    return {
      totalEscrowReceived,
      workersPaid,
      pendingWorkerPayments,
      refundsPending,
      refundsCompleted,
    };
  }, [payments, payouts, refunds]);

  const STATS = [
    { label: 'Total Escrow Received',   value: fmtMoney(kpis.totalEscrowReceived),   icon: IndianRupee, color: '#7A3BFF' },
    { label: 'Workers Paid',            value: fmtMoney(kpis.workersPaid),           icon: Wallet,      color: '#16B364' },
    { label: 'Pending Worker Payments', value: fmtMoney(kpis.pendingWorkerPayments), icon: Clock,       color: '#FF8A1E' },
    { label: 'Refunds Pending',         value: fmtMoney(kpis.refundsPending),        icon: Undo2,       color: '#C91D5E' },
    { label: 'Refunds Completed',       value: fmtMoney(kpis.refundsCompleted),      icon: CheckCircle2,color: '#E5397B' },
  ];

  // ── Charts ──────────────────────────────────────────────
  const weeklyVolume = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return { key: d.toISOString().slice(0, 10), label: d.toLocaleDateString('en-IN', { weekday: 'short' }) };
    });
    const byDay = Object.fromEntries(days.map(d => [d.key, { day: d.label, escrow: 0, payouts: 0 }]));
    payments.forEach(p => {
      const key = p.created_at?.slice(0, 10);
      if (byDay[key] && p.payment_type === 'escrow' && ['captured', 'paid'].includes(p.status)) byDay[key].escrow += Number(p.amount || 0);
    });
    payouts.forEach(p => {
      const key = p.created_at?.slice(0, 10);
      if (byDay[key] && p.payment_status === 'paid') byDay[key].payouts += Number(p.net_amount || 0);
    });
    return days.map(d => byDay[d.key]);
  }, [payments, payouts]);

  const queueStatusBreakdown = useMemo(() => {
    const counts = {};
    queueRows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name: QUEUE_STATUS_LABEL[name] ?? name, value, key: name }));
  }, [queueRows]);

  const PIE_COLORS_BY_STATUS = queueStatusBreakdown.map(s => STATUS_COLOR[s.key] ?? 'var(--mut)');

  // ── Filter option sources ──────────────────────────────
  const cities = useMemo(() => [...new Set(jobs.map(j => j.city).filter(Boolean))].sort(), [jobs]);
  const uniqueJobs = useMemo(() => [...new Set(jobs.map(j => j.job_id).filter(Boolean))].sort(), [jobs]);

  // Helper to match search query across Job ID, Payment ID, Worker name, and Hirer name
  const matchesSearch = (itemSearchText) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return itemSearchText.some(text => String(text || '').toLowerCase().includes(q));
  };

  // ── Filtering per tab ───────────────────────────────────
  const filteredQueue = useMemo(() => queueRows.filter(r => {
    const hirer = hirerName(r.job.hirers);
    if (!matchesSearch([r.job.job_id, hirer, r.job.title])) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (cityFilter !== 'all' && r.job.city !== cityFilter) return false;
    if (jobFilter !== 'all' && r.job.job_id !== jobFilter) return false;
    if (!withinRange(r.job.created_at, dateFilter)) return false;
    return true;
  }), [queueRows, search, statusFilter, cityFilter, jobFilter, dateFilter]);

  const filteredPayouts = useMemo(() => payoutRows.filter(r => {
    if (!matchesSearch([r.workerName, r.job?.job_id, r.payout?.payout_id])) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (jobFilter !== 'all' && r.job?.job_id !== jobFilter) return false;
    if (methodFilter !== 'all' && r.method !== methodFilter) return false;
    if (!withinRange(r.date, dateFilter)) return false;
    return true;
  }), [payoutRows, search, statusFilter, jobFilter, methodFilter, dateFilter]);

  const filteredRefunds = useMemo(() => refunds.filter(r => {
    const hirer = hirerName(r.hirers);
    const job_id = r.jobs?.job_id;
    if (!matchesSearch([hirer, job_id, r.refund_id])) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (jobFilter !== 'all' && job_id !== jobFilter) return false;
    if (!withinRange(r.created_at, dateFilter)) return false;
    return true;
  }), [refunds, search, statusFilter, jobFilter, dateFilter]);

  const filteredLedger = useMemo(() => payments.filter(p => {
    const hirer = hirerName(p.hirers);
    const worker = p.labourers?.full_name ?? '';
    if (!matchesSearch([p.payment_id, p.jobs?.job_id, hirer, worker])) return false;
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (cityFilter !== 'all' && p.jobs?.city !== cityFilter) return false;
    if (jobFilter !== 'all' && p.jobs?.job_id !== jobFilter) return false;
    if (methodFilter !== 'all' && p.payment_method !== methodFilter) return false;
    if (!withinRange(p.created_at, dateFilter)) return false;
    return true;
  }), [payments, search, statusFilter, cityFilter, jobFilter, methodFilter, dateFilter]);

  // ── Actions ─────────────────────────────────────────────
  const payWorkers = async (jobId) => {
    setActing(true);
    const workers = (jobWorkersByJobId[jobId] ?? []).filter(w => w.status !== 'cancelled' && w.payout_id);
    await Promise.all(workers.map(async (w) => {
      const payout = payoutsById[w.payout_id];
      if (!payout || payout.payment_status === 'paid') return;
      await supabase.from('worker_payouts').update({ payment_status: 'paid', paid_at: new Date().toISOString() }).eq('id', payout.id);
      await supabase.from('job_workers').update({ payment_status: 'paid' }).eq('id', w.id);
    }));
    const job = jobsById[jobId];
    logActivity('workers_paid', { entityType: 'job', entityId: job?.job_id ?? jobId, description: `Marked worker payouts as paid for job ${job?.job_id ?? jobId}` });
    setActing(false);
    load();
  };

  const closeSettlement = async (jobId) => {
    setActing(true);
    await supabase.from('jobs').update({ escrow_status: 'released' }).eq('id', jobId);
    const job = jobsById[jobId];
    logActivity('settlement_closed', { entityType: 'job', entityId: job?.job_id ?? jobId, description: `Closed settlement for job ${job?.job_id ?? jobId}` });
    setActing(false);
    load();
  };

  const retryRefund = async (refund) => {
    setActing(true);
    await supabase.from('refunds').update({ status: 'pending' }).eq('id', refund.id);
    logActivity('refund_retried', { entityType: 'refund', entityId: refund.refund_id, description: `Retried refund ${refund.refund_id}` });
    setActing(false);
    load();
  };

  const submitRefund = async () => {
    if (!refundDialog?.job) return;
    const amount = Number(refundAmount);
    if (!amount || amount <= 0) return;

    const escrowPayment = (paymentsByJobId[refundDialog.job.id] ?? [])
      .find(p => p.payment_type === 'escrow' && ['captured', 'paid'].includes(p.status));

    setActing(true);
    if (!escrowPayment) {
      alert('No captured escrow payment found for this job — cannot link a refund.');
      setActing(false);
      return;
    }
    const refundId = `REF${Date.now()}`;
    await supabase.from('refunds').insert({
      refund_id: refundId,
      payment_id: escrowPayment.id,
      job_id: refundDialog.job.id,
      hirer_id: refundDialog.job.hirer_id,
      refund_amount: amount,
      refund_reason: refundReason || null,
      status: 'pending',
    });
    const previousRefunds = (refundsByJobId[refundDialog.job.id] ?? []).reduce((s, r) => s + Number(r.refund_amount || 0), 0);
    const totalRefunded = previousRefunds + amount;
    await supabase.from('jobs').update({
      refunded_amount: totalRefunded,
      payment_status: totalRefunded >= Number(refundDialog.job.escrow_amount || 0) ? 'refunded' : 'partially_refunded',
    }).eq('id', refundDialog.job.id);
    logActivity('refund_issued', { entityType: 'job', entityId: refundDialog.job.job_id, description: `Issued refund ${refundId} of ${fmtMoney(amount)} for job ${refundDialog.job.job_id}` });
    setActing(false);
    setRefundDialog(null);
    setRefundAmount('');
    setRefundReason('');
    load();
  };

  const downloadInvoice = (row) => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`
      <html><head><title>Invoice — ${row.job.job_id}</title>
      <style>
        body{font-family:sans-serif;padding:40px;color:#14101C;}
        h1{font-size:20px;} table{width:100%;border-collapse:collapse;margin-top:16px;}
        td,th{padding:8px 12px;text-align:left;border-bottom:1px solid #eee;font-size:13px;}
      </style></head><body>
      <h1>Settlement Invoice — ${row.job.job_id}</h1>
      <p>Hirer: ${hirerName(row.job.hirers)}</p>
      <table>
        <tr><th>Escrow Amount</th><td>${fmtMoney(row.job.escrow_amount)}</td></tr>
        <tr><th>Total Paid to Workers</th><td>${fmtMoney(row.paidAmount)}</td></tr>
        <tr><th>Refunds</th><td>${fmtMoney(row.refundTotal)}</td></tr>
        <tr><th>Remaining Balance</th><td>${fmtMoney(row.job.escrow_amount - row.paidAmount - row.refundTotal)}</td></tr>
      </table>
      </body></html>
    `);
    w.document.close();
    w.print();
  };

  const sheetRow = sheetJobId ? queueRowsById[sheetJobId] : null;

  return (
    <div className="flex flex-col gap-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-black text-3xl tracking-tight text-[var(--ink)]">Settlements</h1>
          <p className="text-sm text-[var(--mut)] font-semibold mt-1">Escrow, worker payouts and refunds across the platform</p>
        </div>
        <Button
          variant="ghost"
          onClick={load}
          className="glass rounded-xl px-4 py-2 h-auto gap-2 text-sm font-semibold text-[var(--mut)] hover:text-[var(--ink)] hover:bg-transparent"
        >
          <RefreshCw size={14} />
          Refresh
        </Button>
      </div>

      {/* 1. Finance Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
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
              <span className="value">
                {loading ? <Loader2 size={18} className="animate-spin inline" /> : s.value}
              </span>
            </div>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card rounded-2xl p-6">
          <h2 className="font-display font-bold text-lg text-[var(--ink)] mb-1">Weekly Settlement Flow</h2>
          <p className="text-xs text-[var(--mut)] font-semibold mb-5">Escrow received vs worker payouts paid</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weeklyVolume} barSize={12} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(20,16,28,0.06)" />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: 'var(--mut)', fontWeight: 600 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--mut)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
              <Tooltip
                formatter={(v) => fmtMoney(v)}
                contentStyle={{ borderRadius: 12, border: '1px solid rgba(20,16,28,0.08)', background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)' }}
                labelStyle={{ fontWeight: 700, fontSize: 13 }}
              />
              <Bar dataKey="escrow"  name="Escrow"  fill="#7A3BFF" radius={[6, 6, 0, 0]} />
              <Bar dataKey="payouts" name="Payouts" fill="#16B364" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card rounded-2xl p-6">
          <h2 className="font-display font-bold text-lg text-[var(--ink)] mb-1">Settlement Queue Breakdown</h2>
          <p className="text-xs text-[var(--mut)] font-semibold mb-5">Jobs by settlement status</p>
          {queueStatusBreakdown.length === 0 ? (
            <div className="flex items-center justify-center h-[220px] text-sm text-[var(--mut)] font-semibold">No jobs yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={queueStatusBreakdown} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                  {queueStatusBreakdown.map((entry, i) => (
                    <Cell key={entry.key} fill={PIE_COLORS_BY_STATUS[i]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid rgba(20,16,28,0.08)', background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 600, color: 'var(--mut)' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mut)]" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by Job ID, Payment ID, Worker, Hirer…"
            className="h-9 rounded-xl pl-8 glass border-0 text-sm"
          />
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="h-9 rounded-xl glass border-0 px-3 text-xs font-bold uppercase tracking-wider text-[var(--mut)] cursor-pointer outline-none"
        >
          <option value="all">All Statuses</option>
          {tab === 'queue' && Object.entries(QUEUE_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          {tab === 'payouts' && ['pending', 'processing', 'paid', 'failed'].map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
          {tab === 'refunds' && ['pending', 'processing', 'completed', 'failed'].map(s => <option key={s} value={s}>{s}</option>)}
          {tab === 'ledger' && ['pending', 'authorized', 'captured', 'paid', 'failed', 'refunded', 'cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* Job filter dropdown */}
        <select
          value={jobFilter}
          onChange={e => setJobFilter(e.target.value)}
          className="h-9 rounded-xl glass border-0 px-3 text-xs font-bold uppercase tracking-wider text-[var(--mut)] cursor-pointer outline-none"
        >
          <option value="all">All Jobs</option>
          {uniqueJobs.map(id => <option key={id} value={id}>{id}</option>)}
        </select>

        {/* City filter — queue & ledger */}
        {(tab === 'queue' || tab === 'ledger') && (
          <select
            value={cityFilter}
            onChange={e => setCityFilter(e.target.value)}
            className="h-9 rounded-xl glass border-0 px-3 text-xs font-bold uppercase tracking-wider text-[var(--mut)] cursor-pointer outline-none"
          >
            <option value="all">All Cities</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}

        {/* Payment method filter — payouts & ledger */}
        {(tab === 'payouts' || tab === 'ledger') && (
          <select
            value={methodFilter}
            onChange={e => setMethodFilter(e.target.value)}
            className="h-9 rounded-xl glass border-0 px-3 text-xs font-bold uppercase tracking-wider text-[var(--mut)] cursor-pointer outline-none"
          >
            <option value="all">All Methods</option>
            {['razorpay', 'upi', 'bank_transfer', 'cash'].map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
          </select>
        )}

        {/* Date filter */}
        <select
          value={dateFilter}
          onChange={e => setDateFilter(e.target.value)}
          className="h-9 rounded-xl glass border-0 px-3 text-xs font-bold uppercase tracking-wider text-[var(--mut)] cursor-pointer outline-none"
        >
          <option value="all">All Time</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="90d">Last 90 Days</option>
        </select>
      </div>

      {/* Tabs: Queue / Payouts / Refunds / Ledger */}
      <Tabs value={tab} onValueChange={setTab} className="flex-col gap-4">
        <div className="flex items-center justify-between">
          <TabsList className="h-auto w-fit gap-2 rounded-xl bg-transparent p-0">
            {[
              { id: 'queue',   label: 'Settlement Queue' },
              { id: 'payouts', label: 'Worker Payouts'   },
              { id: 'refunds', label: 'Refunds'          },
              { id: 'ledger',  label: 'Escrow Ledger'    },
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

          {tab === 'refunds' && (
            <Button
              size="sm"
              className="gap-1.5 rounded-lg"
              style={{ background: 'var(--grad)', color: '#fff' }}
              onClick={() => setRefundDialog({ job: null })}
            >
              <Undo2 size={13} /> Initiate Refund
            </Button>
          )}
        </div>

        {/* 2. Settlement Queue */}
        <TabsContent value="queue">
          <div className="glass-card rounded-2xl overflow-hidden">
            {loading ? (
              <LoadingRow label="settlements" />
            ) : filteredQueue.length === 0 ? (
              <EmptyRow label="settlements" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-[var(--divider)] hover:bg-transparent">
                    <TableHead className={th}>Job</TableHead>
                    <TableHead className={th}>Hirer</TableHead>
                    <TableHead className={th}>Escrow</TableHead>
                    <TableHead className={th}>Workers Paid</TableHead>
                    <TableHead className={th}>Refund</TableHead>
                    <TableHead className={th}>Status</TableHead>
                    <TableHead className={th}>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredQueue.map(r => (
                    <TableRow key={r.job.id} className="border-[var(--divider)] hover:bg-black/[0.018] cursor-pointer" onClick={() => setSheetJobId(r.job.id)}>
                      <TableCell className={tdStrong}>{r.job.job_id}</TableCell>
                      <TableCell className={td}>{hirerName(r.job.hirers)}</TableCell>
                      <TableCell className={td}>{fmtMoney(r.displayEscrow)}</TableCell>
                      <TableCell className={td}>{fmtMoney(r.paidAmount)}</TableCell>
                      <TableCell className={td}>{fmtMoney(r.refundTotal)}</TableCell>
                      <TableCell><StatusBadge status={r.status} label={r.status === 'ready_for_settlement' ? 'Ready' : (QUEUE_STATUS_LABEL[r.status] ?? r.status)} /></TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          className="rounded-lg"
                          style={{ background: 'var(--grad)', color: '#fff' }}
                          onClick={(e) => { e.stopPropagation(); setSheetJobId(r.job.id); }}
                        >
                          Process
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* 3. Worker Payouts */}
        <TabsContent value="payouts">
          <div className="glass-card rounded-2xl overflow-hidden">
            {loading ? (
              <LoadingRow label="payouts" />
            ) : filteredPayouts.length === 0 ? (
              <EmptyRow label="payouts" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-[var(--divider)] hover:bg-transparent">
                    <TableHead className={th}>Worker</TableHead>
                    <TableHead className={th}>Job</TableHead>
                    <TableHead className={th}>Amount</TableHead>
                    <TableHead className={th}>Method</TableHead>
                    <TableHead className={th}>Status</TableHead>
                    <TableHead className={th}>Date</TableHead>
                    <TableHead className={th}>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayouts.map(r => (
                    <TableRow key={r.id} className="border-[var(--divider)] hover:bg-black/[0.018]">
                      <TableCell className={tdStrong}>{r.workerName}</TableCell>
                      <TableCell className={td}>{r.job?.job_id ?? '—'}</TableCell>
                      <TableCell className={td}>{r.amount != null ? fmtMoney(r.amount) : '—'}</TableCell>
                      <TableCell className={cn(td, 'capitalize')}>{r.method?.replace('_', ' ') ?? '—'}</TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell className={td}>{fmtDate(r.date)}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="rounded-lg glass text-[var(--mut)] hover:text-[var(--ink)]"
                          disabled={!r.job}
                          onClick={() => r.job && setSheetJobId(r.job.id)}
                        >
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* 4. Refunds */}
        <TabsContent value="refunds">
          <div className="glass-card rounded-2xl overflow-hidden">
            {loading ? (
              <LoadingRow label="refunds" />
            ) : filteredRefunds.length === 0 ? (
              <EmptyRow label="refunds" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-[var(--divider)] hover:bg-transparent">
                    <TableHead className={th}>Hirer</TableHead>
                    <TableHead className={th}>Job</TableHead>
                    <TableHead className={th}>Refund</TableHead>
                    <TableHead className={th}>Status</TableHead>
                    <TableHead className={th}>Date</TableHead>
                    <TableHead className={th}>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRefunds.map(r => (
                    <TableRow key={r.id} className="border-[var(--divider)] hover:bg-black/[0.018]">
                      <TableCell className={tdStrong}>{hirerName(r.hirers)}</TableCell>
                      <TableCell className={td}>{r.jobs?.job_id ?? '—'}</TableCell>
                      <TableCell className={td}>{fmtMoney(r.refund_amount)}</TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell className={td}>{fmtDate(r.refunded_at ?? r.created_at)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            className="gap-1.5 rounded-lg"
                            style={{ background: 'var(--grad)', color: '#fff' }}
                            onClick={() => setRefundDialog({ job: r.job_id ? jobsById[r.job_id] : null })}
                          >
                            Initiate Refund
                          </Button>
                          {r.razorpay_refund_id ? (
                            <Button
                              size="sm" variant="ghost"
                              className="rounded-lg glass text-[var(--mut)] hover:text-[var(--ink)] gap-1"
                              onClick={() => window.open(`https://dashboard.razorpay.com/app/refunds/${r.razorpay_refund_id}`, '_blank')}
                            >
                              <ExternalLink size={12} /> View Razorpay Refund
                            </Button>
                          ) : null}
                          {r.status === 'failed' && (
                            <Button
                              size="sm"
                              className="rounded-lg gap-1 bg-[rgba(255,138,30,0.12)] text-[var(--saffron)] hover:bg-[rgba(255,138,30,0.2)] shadow-none"
                              disabled={acting}
                              onClick={() => retryRefund(r)}
                            >
                              <RotateCcw size={12} /> Retry
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* 5. Escrow Ledger */}
        <TabsContent value="ledger">
          <div className="glass-card rounded-2xl overflow-hidden">
            {loading ? (
              <LoadingRow label="payments" />
            ) : filteredLedger.length === 0 ? (
              <EmptyRow label="payments" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-[var(--divider)] hover:bg-transparent">
                    <TableHead className={th}>Payment ID</TableHead>
                    <TableHead className={th}>Job</TableHead>
                    <TableHead className={th}>Hirer</TableHead>
                    <TableHead className={th}>Amount</TableHead>
                    <TableHead className={th}>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLedger.map(p => (
                    <TableRow key={p.id} className="border-[var(--divider)] hover:bg-black/[0.018]">
                      <TableCell className={tdStrong}>{p.payment_id}</TableCell>
                      <TableCell className={td}>{p.jobs?.job_id ?? '—'}</TableCell>
                      <TableCell className={td}>{p.hirer_id ? hirerName(p.hirers) : (p.labourers?.full_name ?? '—')}</TableCell>
                      <TableCell className={tdStrong}>{fmtMoney(p.amount)}</TableCell>
                      <TableCell><StatusBadge status={p.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* 6. Settlement Details Sheet */}
      <Sheet open={!!sheetRow} onOpenChange={(open) => !open && setSheetJobId(null)}>
        <SheetContent className="w-full sm:max-w-lg gap-0 overflow-y-auto">
          {sheetRow && (
            <>
              <SheetHeader className="border-b border-[var(--divider)]">
                <div className="flex items-center gap-2">
                  <SheetTitle className="font-display text-xl">{sheetRow.job.job_id}</SheetTitle>
                  <StatusBadge status={sheetRow.status} label={sheetRow.status === 'ready_for_settlement' ? 'Ready' : (QUEUE_STATUS_LABEL[sheetRow.status] ?? sheetRow.status)} />
                </div>
                <SheetDescription>{hirerName(sheetRow.job.hirers)} · {sheetRow.job.city}</SheetDescription>
              </SheetHeader>

              <div className="p-4 flex flex-col gap-5">
                {/* Info grid */}
                <div className="grid grid-cols-3 gap-3">
                  <InfoTile label="Escrow" value={fmtMoney(sheetRow.job.escrow_amount)} />
                  <InfoTile label="Workers Required" value={sheetRow.job.workers_required} />
                  <InfoTile label="Workers Worked" value={sheetRow.workersWorked} />
                </div>

                {/* Worker payments */}
                <div>
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--mut)] mb-2">Worker Payments</h3>
                  <div className="flex flex-col gap-1.5 max-h-[260px] overflow-y-auto pr-1">
                    {sheetRow.workers.length === 0 ? (
                      <p className="text-sm text-[var(--mut)] font-semibold py-4 text-center">No workers assigned yet.</p>
                    ) : sheetRow.workers.map(w => {
                      const payout = w.payout_id ? payoutsById[w.payout_id] : null;
                      const status = payout?.payment_status ?? w.payment_status ?? 'pending';
                      return (
                        <div key={w.id} className="flex items-center justify-between rounded-xl glass px-3 py-2">
                          <span className="text-sm font-semibold text-[var(--ink)]">{w.labourers?.full_name ?? '—'}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[var(--mut)]">{payout ? fmtMoney(payout.net_amount) : '—'}</span>
                            <StatusBadge status={status} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Totals */}
                <div className="rounded-xl glass p-3 flex flex-col gap-2">
                  <TotalRow label="Total Paid" value={fmtMoney(sheetRow.paidAmount)} />
                  <TotalRow label="Refund" value={fmtMoney(sheetRow.refundTotal)} />
                  <div className="border-t border-[var(--divider)] my-1" />
                  <TotalRow
                    label="Remaining Balance"
                    value={fmtMoney(sheetRow.job.escrow_amount - sheetRow.paidAmount - sheetRow.refundTotal)}
                    strong
                  />
                </div>
              </div>

              <SheetFooter className="border-t border-[var(--divider)] flex-row flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={acting || sheetRow.pendingWorkerCount === 0}
                  onClick={() => payWorkers(sheetRow.job.id)}
                  className="gap-1.5 rounded-lg bg-[var(--green-soft)] text-[var(--green)] hover:bg-[#c8f0d8] shadow-none flex-1"
                >
                  {acting ? <Loader2 size={13} className="animate-spin" /> : <Wallet size={13} />}
                  Pay Workers
                </Button>
                <Button
                  size="sm"
                  onClick={() => setRefundDialog({ job: sheetRow.job })}
                  className="gap-1.5 rounded-lg bg-[rgba(201,29,94,0.08)] text-[var(--accent)] hover:bg-[rgba(201,29,94,0.15)] shadow-none flex-1"
                >
                  <Undo2 size={13} /> Issue Refund
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => downloadInvoice(sheetRow)}
                  className="gap-1.5 rounded-lg glass text-[var(--mut)] hover:text-[var(--ink)] flex-1"
                >
                  <Printer size={13} /> Download Invoice
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={acting || sheetRow.status !== 'completed'}
                  onClick={() => closeSettlement(sheetRow.job.id)}
                  className="gap-1.5 rounded-lg glass text-[var(--mut)] hover:text-[var(--ink)] flex-1"
                >
                  <CheckCircle2 size={13} /> Close Settlement
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Issue / Initiate Refund dialog */}
      <Dialog open={!!refundDialog} onOpenChange={(open) => !open && setRefundDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue Refund</DialogTitle>
            <DialogDescription>
              {refundDialog?.job ? `For ${refundDialog.job.job_id} · ${hirerName(refundDialog.job.hirers)}` : 'Select a job and enter refund details.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            {!refundDialog?.job && (
              <select
                onChange={(e) => setRefundDialog({ job: jobsById[e.target.value] ?? null })}
                className="h-9 rounded-lg border border-[var(--input-border)] bg-white/80 px-2.5 text-sm font-medium text-[var(--ink)] outline-none"
                defaultValue=""
              >
                <option value="" disabled>Select job…</option>
                {jobs.map(j => <option key={j.id} value={j.id}>{j.job_id} — {hirerName(j.hirers)}</option>)}
              </select>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--mut)]">Amount (₹)</label>
              <Input
                type="number"
                value={refundAmount}
                onChange={e => setRefundAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--mut)]">Reason</label>
              <textarea
                rows={3}
                value={refundReason}
                onChange={e => setRefundReason(e.target.value)}
                placeholder="e.g. Job cancelled midway, unused escrow balance…"
                className="w-full rounded-xl border border-[var(--input-border)] bg-white/80 px-3 py-2 text-sm font-medium text-[var(--ink)] resize-none outline-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundDialog(null)}>Cancel</Button>
            <Button
              disabled={acting || !refundDialog?.job || !refundAmount}
              onClick={submitRefund}
              style={{ background: 'var(--grad)', color: '#fff' }}
            >
              {acting ? <Loader2 size={14} className="animate-spin" /> : 'Submit Refund'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

function InfoTile({ label, value }) {
  return (
    <div className="rounded-xl glass p-3 flex flex-col gap-0.5">
      <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--mut)]">{label}</span>
      <span className="font-display font-bold text-lg text-[var(--ink)]">{value}</span>
    </div>
  );
}

function TotalRow({ label, value, strong }) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn('text-xs font-bold', strong ? 'text-[var(--ink)]' : 'text-[var(--mut)]')}>{label}</span>
      <span className={cn('text-sm font-extrabold', strong ? 'text-[var(--ink)]' : 'text-[var(--mut)]')}>{value}</span>
    </div>
  );
}

function LoadingRow({ label }) {
  return (
    <div className="flex items-center justify-center py-20 gap-3 text-[var(--mut)]">
      <Loader2 size={20} className="animate-spin" />
      <span className="text-sm font-semibold">Loading {label}…</span>
    </div>
  );
}

function EmptyRow({ label }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-2">
      <p className="text-[var(--mut)] font-semibold text-sm">No {label} found.</p>
    </div>
  );
}
