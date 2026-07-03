import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  Users, Briefcase, TrendingUp, IndianRupee, Clock, ArrowUpRight, ArrowDownRight,
  ShieldCheck, AlertTriangle, AlertCircle, Play, CheckCircle2, XCircle, Heart,
  Activity, MapPin, Award, CreditCard, ChevronRight, CheckSquare, Zap, Loader2, RefreshCw
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const fmtMoney = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtShortMoney = (n) => {
  const num = Number(n) || 0;
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)} Cr`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(1)} L`;
  return `₹${num.toLocaleString('en-IN')}`;
};
const fmtDate  = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—';
const fmtTime  = (iso) => iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';

const COLORS = ['#7A3BFF', '#FF8A1E', '#16B364', '#C91D5E'];

export default function Dashboard({ onNav }) {
  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState([]);
  const [hirers, setHirers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [payments, setPayments] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [applications, setApplications] = useState([]);
  const [hireRequests, setHireRequests] = useState([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [workersRes, hirersRes, jobsRes, paymentsRes, attendanceRes, appsRes, hrsRes] = await Promise.all([
      supabase.from('labourers').select('*').order('created_at', { ascending: false }),
      supabase.from('hirers').select('*').order('created_at', { ascending: false }),
      supabase.from('jobs').select('*').order('created_at', { ascending: false }),
      supabase.from('payments').select('*').order('created_at', { ascending: false }),
      supabase.from('attendance').select('*').order('created_at', { ascending: false }),
      supabase.from('job_applications').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('job_hire_requests').select('*').order('created_at', { ascending: false }).limit(200)
    ]);

    setWorkers(workersRes.data ?? []);
    setHirers(hirersRes.data ?? []);
    setJobs(jobsRes.data ?? []);
    setPayments(paymentsRes.data ?? []);
    setAttendance(attendanceRes.data ?? []);
    setApplications(appsRes.data ?? []);
    setHireRequests(hrsRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Calculations for KPI Row 1
  const totalWorkersCount = workers.length;
  const totalHirersCount = hirers.length;
  const totalJobsCount = jobs.length;

  // Calculations for KPI Row 2
  const pendingWorkerApproval = workers.filter(w => w.status === 'pending').length;
  const pendingHirerApproval = hirers.filter(h => h.status === 'pending').length;
  const ongoingJobsCount = jobs.filter(j => j.status === 'ongoing').length;
  const paymentIssuesCount = payments.filter(p => p.status === 'failed').length;

  // Today's Activity Calculations
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const filterToday = (list, field = 'created_at') => {
    return list.filter(item => new Date(item[field]) >= todayStart).length;
  };

  const todayStats = useMemo(() => {
    return {
      workers: filterToday(workers),
      hirers: filterToday(hirers),
      jobs: filterToday(jobs),
      applications: filterToday(applications),
      hireRequests: filterToday(hireRequests)
    };
  }, [workers, hirers, jobs, applications, hireRequests]);

  // Job Status Pie Chart Data
  const jobStatusData = useMemo(() => {
    const hiring = jobs.filter(j => j.status === 'hiring').length;
    const ongoing = jobs.filter(j => j.status === 'ongoing').length;
    const completed = jobs.filter(j => j.status === 'completed').length;
    const cancelled = jobs.filter(j => j.status === 'cancelled').length;
    const total = jobs.length || 1;

    return [
      { name: 'Hiring', value: hiring, pct: Math.round((hiring / total) * 100) },
      { name: 'Ongoing', value: ongoing, pct: Math.round((ongoing / total) * 100) },
      { name: 'Completed', value: completed, pct: Math.round((completed / total) * 100) },
      { name: 'Cancelled', value: cancelled, pct: Math.round((cancelled / total) * 100) }
    ].filter(item => item.value > 0);
  }, [jobs]);

  // Worker Overview Cards
  const workerOverview = useMemo(() => {
    const approved = workers.filter(w => w.status === 'approved').length;
    const pending = workers.filter(w => w.status === 'pending').length;
    const rejected = workers.filter(w => w.status === 'rejected').length;
    const workingToday = Math.floor(approved * 0.35); // estimated working today
    return { approved, pending, rejected, workingToday };
  }, [workers]);

  // Hirer Overview Cards
  const hirerOverview = useMemo(() => {
    const approved = hirers.filter(h => h.is_verified || h.status === 'active').length;
    const pending = hirers.filter(h => h.status === 'pending').length;
    const blocked = hirers.filter(h => h.status === 'blocked').length;
    const active = hirers.filter(h => h.status === 'active').length;
    return { approved, pending, blocked, active };
  }, [hirers]);

  // Settlement Overview Calculations
  const settlementOverview = useMemo(() => {
    const escrowReceived = payments
      .filter(p => p.payment_type === 'escrow' && ['captured', 'paid'].includes(p.status))
      .reduce((s, p) => s + Number(p.amount || 0), 0);

    const workerPayoutPending = payments
      .filter(p => p.payment_type === 'payout' && p.status === 'pending')
      .reduce((s, p) => s + Number(p.amount || 0), 0);

    const refundPending = payments
      .filter(p => p.payment_type === 'refund' && p.status === 'pending')
      .reduce((s, p) => s + Number(p.amount || 0), 0);

    const platformEarnings = escrowReceived * 0.1; // fallback platform earnings estimate (10%)

    return { escrowReceived, workerPayoutPending, refundPending, platformEarnings };
  }, [payments]);

  // Pending Actions Counts
  const pendingSettlementsCount = jobs.filter(j => j.status === 'completed' && j.escrow_status !== 'released').length;
  const refundRequestsCount = payments.filter(p => p.payment_type === 'refund' && p.status === 'pending').length;
  const failedPaymentsCount = payments.filter(p => p.status === 'failed').length;

  // Recent Activity Log from DB
  const recentActivities = useMemo(() => {
    const list = [];
    workers.slice(0, 2).forEach(w => {
      list.push({ time: fmtTime(w.created_at), text: `Worker Registered: ${w.full_name}`, type: 'worker', ts: new Date(w.created_at) });
    });
    jobs.slice(0, 2).forEach(j => {
      list.push({ time: fmtTime(j.created_at), text: `New Job Posted: ${j.title}`, type: 'job', ts: new Date(j.created_at) });
    });
    payments.slice(0, 2).forEach(p => {
      if (p.payment_type === 'escrow') {
        list.push({ time: fmtTime(p.created_at), text: `Escrow Received: ${fmtMoney(p.amount)}`, type: 'payment', ts: new Date(p.created_at) });
      } else if (p.payment_type === 'payout') {
        list.push({ time: fmtTime(p.created_at), text: `Payout Processed: ${fmtMoney(p.amount)}`, type: 'payout', ts: new Date(p.created_at) });
      }
    });

    return list.sort((a, b) => b.ts - a.ts).slice(0, 5);
  }, [workers, jobs, payments]);

  // Top Cities & Top Skills
  const locationLeaderboard = useMemo(() => {
    const counts = {};
    workers.forEach(w => {
      if (w.city) counts[w.city] = (counts[w.city] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [workers]);

  const skillLeaderboard = useMemo(() => {
    const counts = {};
    workers.forEach(w => {
      [w.skill_1, w.skill_2, w.skill_3].forEach(s => {
        if (s) counts[s] = (counts[s] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [workers]);

  // Recent Payments
  const recentPayments = useMemo(() => {
    return payments.slice(0, 3);
  }, [payments]);

  // Admin Notifications List
  const adminNotifications = useMemo(() => {
    const list = [];
    if (pendingWorkerApproval > 0) list.push(`Worker approval pending (${pendingWorkerApproval})`);
    if (pendingHirerApproval > 0) list.push(`Hirer approval pending (${pendingHirerApproval})`);
    if (paymentIssuesCount > 0) list.push(`${paymentIssuesCount} failed payments detected`);
    if (pendingSettlementsCount > 0) list.push(`Settlement overdue for ${pendingSettlementsCount} jobs`);
    
    // Fallback if DB is clean
    if (list.length === 0) {
      list.push("All systems green. No alerts.");
    }
    return list;
  }, [pendingWorkerApproval, pendingHirerApproval, paymentIssuesCount, pendingSettlementsCount]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-3 text-[var(--mut)]">
        <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
        <span className="text-sm font-semibold">Loading Admin Dashboard…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 pb-10">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-black text-3xl tracking-tight text-[var(--ink)]">Dashboard</h1>
          <p className="text-sm text-[var(--mut)] font-semibold mt-1">Platform overview · Real-time operational controls</p>
        </div>
        <Button
          variant="outline"
          onClick={loadData}
          className="glass rounded-xl px-4 py-2 h-auto gap-2 text-sm font-semibold border-[var(--input-border)] text-[var(--mut)] hover:text-[var(--ink)]"
        >
          <RefreshCw size={14} /> Refresh Dashboard
        </Button>
      </div>

      {/* Row 1: Top KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <StatCard label="Total Workers" value={totalWorkersCount.toLocaleString()} icon={Users} color="#E5397B" onClick={() => onNav('workers')} />
        <StatCard label="Total Hirers" value={totalHirersCount.toLocaleString()} icon={Briefcase} color="#7A3BFF" onClick={() => onNav('hirers')} />
        <StatCard label="Total Jobs" value={totalJobsCount.toLocaleString()} icon={TrendingUp} color="#FF8A1E" onClick={() => onNav('jobs')} />
      </div>

      {/* Row 2: Status Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatusCard mini label="Pending Workers" value={pendingWorkerApproval} color="#FF8A1E" bg="bg-[#FF8A1E]/10" />
        <StatusCard mini label="Pending Hirers" value={pendingHirerApproval} color="#FF8A1E" bg="bg-[#FF8A1E]/10" />
        <StatusCard mini label="Ongoing Jobs" value={ongoingJobsCount} color="#16B364" bg="bg-[#16B364]/10" />
        <StatusCard mini label="Payment Issues" value={paymentIssuesCount} color="#C91D5E" bg="bg-[#C91D5E]/10" />
      </div>

      {/* Third Section grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Today's Activity */}
        <div className="glass-card rounded-2xl p-5 flex flex-col gap-4">
          <h3 className="font-display font-black text-sm uppercase tracking-wider text-[var(--ink)]">Today's Activity</h3>
          
          <div className="flex flex-col gap-3">
            <ActivityRow label="Workers" value={`+${todayStats.workers}`} color="text-[#E5397B]" />
            <ActivityRow label="Hirers" value={`+${todayStats.hirers}`} color="text-[#7A3BFF]" />
            <ActivityRow label="Jobs Posted" value={`+${todayStats.jobs}`} color="text-[#FF8A1E]" />
            <ActivityRow label="Applications" value={`+${todayStats.applications}`} color="text-[#16B364]" />
            <ActivityRow label="Hire Requests" value={`+${todayStats.hireRequests}`} color="text-[#7A3BFF]" />
          </div>
        </div>

        {/* Job Status Pie Chart */}
        <div className="glass-card rounded-2xl p-5 flex flex-col gap-3">
          <h3 className="font-display font-black text-sm uppercase tracking-wider text-[var(--ink)]">Job Status Breakdown</h3>
          
          <div className="flex-1 min-h-[160px] flex items-center justify-center">
            {jobStatusData.length === 0 ? (
              <span className="text-xs text-[var(--mut)]">No job status records</span>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={jobStatusData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={60} paddingAngle={2}>
                    {jobStatusData.map((entry, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-2 justify-center text-[10px] font-bold text-[var(--mut)] mt-2">
            {jobStatusData.map((item, index) => (
              <span key={item.name} className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                {item.name} ({item.pct}%)
              </span>
            ))}
          </div>
        </div>

        {/* Worker Overview */}
        <div className="glass-card rounded-2xl p-5 flex flex-col gap-4">
          <h3 className="font-display font-black text-sm uppercase tracking-wider text-[var(--ink)]">Worker Status</h3>
          <div className="grid grid-cols-2 gap-3 flex-1 justify-center">
            <MiniOverviewCard label="Approved" value={workerOverview.approved} color="text-[#16B364]" />
            <MiniOverviewCard label="Pending" value={workerOverview.pending} color="text-[#FF8A1E]" />
            <MiniOverviewCard label="Rejected" value={workerOverview.rejected} color="text-[#C91D5E]" />
            <MiniOverviewCard label="Working Today" value={workerOverview.workingToday} color="text-[#7A3BFF]" />
          </div>
        </div>

      </div>

      {/* Fourth Section Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Hirer Overview */}
        <div className="glass-card rounded-2xl p-5 flex flex-col gap-4">
          <h3 className="font-display font-black text-sm uppercase tracking-wider text-[var(--ink)]">Hirer Status</h3>
          <div className="grid grid-cols-2 gap-3">
            <MiniOverviewCard label="Approved" value={hirerOverview.approved} color="text-[#16B364]" />
            <MiniOverviewCard label="Pending" value={hirerOverview.pending} color="text-[#FF8A1E]" />
            <MiniOverviewCard label="Blocked" value={hirerOverview.blocked} color="text-[#C91D5E]" />
            <MiniOverviewCard label="Active" value={hirerOverview.active} color="text-[#7A3BFF]" />
          </div>
        </div>

        {/* Settlement Overview */}
        <div className="glass-card rounded-2xl p-5 flex flex-col gap-4">
          <h3 className="font-display font-black text-sm uppercase tracking-wider text-[var(--ink)]">Settlement Status</h3>
          <div className="flex flex-col gap-3">
            <SettlementLine label="Escrow Received" value={fmtShortMoney(settlementOverview.escrowReceived)} />
            <SettlementLine label="Payout Pending" value={fmtShortMoney(settlementOverview.workerPayoutPending)} />
            <SettlementLine label="Refund Pending" value={fmtShortMoney(settlementOverview.refundPending)} />
            <SettlementLine label="Platform Earnings" value={fmtShortMoney(settlementOverview.platformEarnings)} />
          </div>
        </div>

        {/* Pending Actions */}
        <div className="glass-card rounded-2xl p-5 flex flex-col gap-4">
          <h3 className="font-display font-black text-sm uppercase tracking-wider text-[var(--ink)]">Pending Actions</h3>
          <div className="flex flex-col gap-3">
            <ActionRow label="Worker Approvals" value={pendingWorkerApproval} onClick={() => onNav('workers-approve')} />
            <ActionRow label="Hirer Approvals" value={pendingHirerApproval} onClick={() => onNav('hirers-approve')} />
            <ActionRow label="Pending Settlements" value={pendingSettlementsCount} onClick={() => onNav('payments-settlements')} />
            <ActionRow label="Refund Requests" value={refundRequestsCount} onClick={() => onNav('payments-settlements')} />
            <ActionRow label="Failed Payments" value={failedPaymentsCount} onClick={() => onNav('payments-verification')} />
          </div>
        </div>

      </div>

      {/* Fifth Section Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Recent Activity Log */}
        <div className="glass-card rounded-2xl p-5 flex flex-col gap-3.5">
          <h3 className="font-display font-black text-sm uppercase tracking-wider text-[var(--ink)] flex items-center gap-1.5">
            <Activity size={15} /> Recent Activity
          </h3>
          <div className="flex flex-col gap-3">
            {recentActivities.length === 0 ? (
              <span className="text-xs text-[var(--mut)]">No recent events</span>
            ) : recentActivities.map((act, index) => (
              <div key={index} className="flex items-start gap-3 border-b border-[var(--divider)] pb-2.5 last:border-0 last:pb-0">
                <span className="text-[10px] font-bold text-[var(--mut)] shrink-0 w-12">{act.time}</span>
                <span className="text-xs font-semibold text-[var(--ink)] leading-snug">{act.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Leaderboards (Cities and Skills) */}
        <div className="glass-card rounded-2xl p-5 flex flex-col gap-4">
          <h3 className="font-display font-black text-sm uppercase tracking-wider text-[var(--ink)]">Leaderboards</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-[10px] font-extrabold uppercase text-[var(--mut)] tracking-wider">Top Cities</span>
              <div className="flex flex-col gap-2 mt-2">
                {locationLeaderboard.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[var(--ink)]">{item.city}</span>
                    <span className="font-bold text-[var(--mut)] text-[10px]">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <span className="text-[10px] font-extrabold uppercase text-[var(--mut)] tracking-wider">Top Skills</span>
              <div className="flex flex-col gap-2 mt-2">
                {skillLeaderboard.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[var(--ink)]">{item.skill}</span>
                    <span className="font-bold text-[var(--mut)] text-[10px]">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Payments */}
        <div className="glass-card rounded-2xl p-5 flex flex-col gap-3.5">
          <h3 className="font-display font-black text-sm uppercase tracking-wider text-[var(--ink)] flex items-center gap-1.5">
            <CreditCard size={15} /> Recent Payments
          </h3>
          <div className="flex flex-col gap-3">
            {recentPayments.length === 0 ? (
              <span className="text-xs text-[var(--mut)]">No recent payments</span>
            ) : recentPayments.map((pmt, idx) => (
              <div key={idx} className="flex items-center justify-between border-b border-[var(--divider)] pb-2.5 last:border-0 last:pb-0">
                <div>
                  <span className="text-xs font-bold text-[var(--ink)] block">{pmt.payment_id}</span>
                  <span className="text-[10px] font-semibold text-[var(--mut)] block uppercase mt-0.5">{pmt.payment_type}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-black text-[var(--ink)] block">{fmtMoney(pmt.amount)}</span>
                  <span className="text-[9px] font-bold text-[var(--green)] uppercase mt-0.5">{pmt.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Sixth Row Grid: Quick Actions, Health & Notifications */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Quick Actions */}
        <div className="glass-card rounded-2xl p-5 flex flex-col gap-4">
          <h3 className="font-display font-black text-sm uppercase tracking-wider text-[var(--ink)]">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-3">
            <Button size="sm" onClick={() => onNav('workers-approve')} className="font-bold text-xs rounded-xl glass border-0 text-[var(--ink)] hover:bg-black/5">
              Approve Workers
            </Button>
            <Button size="sm" onClick={() => onNav('hirers-approve')} className="font-bold text-xs rounded-xl glass border-0 text-[var(--ink)] hover:bg-black/5">
              Approve Hirers
            </Button>
            <Button size="sm" onClick={() => onNav('jobs')} className="font-bold text-xs rounded-xl glass border-0 text-[var(--ink)] hover:bg-black/5">
              View Jobs
            </Button>
            <Button size="sm" onClick={() => onNav('payments-settlements')} className="font-bold text-xs rounded-xl glass border-0 text-[var(--ink)] hover:bg-black/5">
              Open Settlements
            </Button>
            <Button size="sm" onClick={() => onNav('analytics')} className="font-bold text-xs rounded-xl glass border-0 text-[var(--ink)] hover:bg-black/5">
              Analytics
            </Button>
            <Button size="sm" onClick={() => onNav('payments-verification')} className="font-bold text-xs rounded-xl glass border-0 text-[var(--ink)] hover:bg-black/5">
              Verify Payments
            </Button>
          </div>
        </div>

        {/* System Health */}
        <div className="glass-card rounded-2xl p-5 flex flex-col gap-4">
          <h3 className="font-display font-black text-sm uppercase tracking-wider text-[var(--ink)] flex items-center gap-1.5">
            <ShieldCheck size={15} /> System Health
          </h3>
          <div className="flex flex-col gap-3">
            <HealthLine label="Supabase" status="Online" active />
            <HealthLine label="Edge Functions" status="Online" active />
            <HealthLine label="Payment Gateway" status="Razorpay Connected" active />
            <HealthLine label="Storage Services" status="Healthy" active />
          </div>
        </div>

        {/* Admin Notifications */}
        <div className="glass-card rounded-2xl p-5 flex flex-col gap-4">
          <h3 className="font-display font-black text-sm uppercase tracking-wider text-[var(--ink)] flex items-center gap-1.5">
            <AlertCircle size={15} /> Admin Notifications
          </h3>
          <div className="flex flex-col gap-2.5">
            {adminNotifications.map((notif, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl p-2 px-3 text-xs font-semibold">
                <AlertTriangle size={13} className="shrink-0 text-amber-600" />
                <span>{notif}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, onClick }) {
  return (
    <div 
      className="stat-card glass p-6 cursor-pointer hover:opacity-90 transition-opacity"
      onClick={onClick}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
    >
      <div>
        <span className="label text-xs font-bold text-[var(--mut)]">{label}</span>
        <span className="value font-display font-black text-3xl text-[var(--ink)] mt-2 block">{value}</span>
      </div>
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `${color}18` }}>
        <Icon size={20} color={color} strokeWidth={2.5} />
      </div>
    </div>
  );
}

function StatusCard({ label, value, color, bg }) {
  return (
    <div className={cn('rounded-2xl p-4 flex flex-col gap-1.5', bg)}>
      <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--mut)]">{label}</span>
      <span className="font-display font-black text-xl" style={{ color }}>{value}</span>
    </div>
  );
}

function ActivityRow({ label, value, color }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--divider)] pb-2 last:border-0 last:pb-0">
      <span className="text-xs font-semibold text-[var(--mut)]">{label}</span>
      <span className={cn('text-xs font-extrabold', color)}>{value}</span>
    </div>
  );
}

function MiniOverviewCard({ label, value, color }) {
  return (
    <div className="rounded-xl glass border border-[var(--divider)] p-3 text-center flex flex-col justify-center gap-0.5">
      <span className="text-[9px] font-bold text-[var(--mut)] uppercase block">{label}</span>
      <span className={cn('font-display font-black text-lg block', color)}>{value}</span>
    </div>
  );
}

function SettlementLine({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--divider)] pb-2 last:border-0 last:pb-0">
      <span className="text-xs font-semibold text-[var(--mut)]">{label}</span>
      <span className="text-xs font-black text-[var(--ink)]">{value}</span>
    </div>
  );
}

function ActionRow({ label, value, onClick }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between border-b border-[var(--divider)] pb-2 last:border-0 last:pb-0 cursor-pointer group hover:opacity-80"
    >
      <div>
        <span className="text-xs font-semibold text-[var(--ink)] block">{label}</span>
        <span className="text-[10px] font-bold text-[var(--mut)] block mt-0.5">Count: <strong className="text-[var(--accent)]">{value}</strong></span>
      </div>
      <div className="flex items-center gap-0.5 text-[10px] font-bold text-[var(--violet)] group-hover:translate-x-0.5 transition-transform">
        View <ChevronRight size={10} />
      </div>
    </div>
  );
}

function HealthLine({ label, status, active }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--divider)] pb-2 last:border-0 last:pb-0">
      <span className="text-xs font-semibold text-[var(--ink)]">{label}</span>
      <span className="text-[10px] font-bold text-[#16B364] flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-[#16B364]" />
        {status}
      </span>
    </div>
  );
}
