import React, { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabaseRead } from '../lib/supabase';
import { queryKeys } from '../lib/queryKeys';
import {
  TrendingUp, Users, Briefcase, IndianRupee, CreditCard, UserCheck, ShieldAlert,
  ArrowUpRight, ArrowDownRight, RefreshCw, Loader2, Download, Filter, Calendar,
  Award, MapPin, Sparkles, Clock, CheckCircle2, AlertCircle, XCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area
} from 'recharts';
import { cn } from '@/lib/utils';

const FETCH_LIMIT = 1000;
const COLORS = ['#7A3BFF', '#FF8A1E', '#16B364', '#C91D5E', '#00C49F', '#FFBB28', '#FF8042', '#0088FE'];

const fmtMoney = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtMoneyExact = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate  = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—';
const fmtDateTime = (iso) => iso
  ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

const TX_STATUSES = ['all', 'created', 'captured', 'paid', 'pending', 'failed', 'refunded'];

export default function Analytics() {
  // Filters
  const [dateRange, setDateRange] = useState('30d'); // today, 7d, 30d, 90d, year, custom
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [txStatusFilter, setTxStatusFilter] = useState('all');

  // Load all tables for aggregate analytics (cached — see src/lib/queryClient.js)
  const { data, isLoading: loading, refetch } = useQuery({
    queryKey: queryKeys.analyticsBundle,
    queryFn: async () => {
      // Heavy full-table pulls aggregated client-side — routed to the read
      // replica (supabaseRead) so they can't slow the primary that serves the
      // app. Pure reads, no read-your-writes expectation.
      const [jobsRes, workersRes, hirersRes, paymentsRes, attendanceRes] = await Promise.all([
        supabaseRead.from('jobs').select('*').limit(FETCH_LIMIT),
        supabaseRead.from('labourers').select('*').limit(FETCH_LIMIT),
        supabaseRead.from('hirers').select('*').limit(FETCH_LIMIT),
        supabaseRead.from('payments').select('*').limit(FETCH_LIMIT),
        supabaseRead.from('attendance').select('*').limit(FETCH_LIMIT * 2)
      ]);

      return {
        jobs: jobsRes.data ?? [],
        workers: workersRes.data ?? [],
        hirers: hirersRes.data ?? [],
        payments: paymentsRes.data ?? [],
        attendance: attendanceRes.data ?? [],
      };
    },
  });

  const jobs = data?.jobs ?? [];
  const workers = data?.workers ?? [];
  const hirers = data?.hirers ?? [];
  const payments = data?.payments ?? [];
  const attendance = data?.attendance ?? [];
  const load = () => refetch();

  // Date range cutoff helper
  const dateCutoff = useMemo(() => {
    const now = new Date();
    if (dateRange === 'today') {
      now.setHours(0, 0, 0, 0);
      return now;
    }
    const daysMap = { '7d': 7, '30d': 30, '90d': 90 };
    if (daysMap[dateRange]) {
      return new Date(Date.now() - daysMap[dateRange] * 24 * 60 * 60 * 1000);
    }
    if (dateRange === 'year') {
      return new Date(now.getFullYear(), 0, 1);
    }
    if (dateRange === 'custom' && customStart) {
      return new Date(customStart);
    }
    return null;
  }, [dateRange, customStart]);

  const dateEndCutoff = useMemo(() => {
    if (dateRange === 'custom' && customEnd) {
      return new Date(customEnd);
    }
    return null;
  }, [dateRange, customEnd]);

  // Generic filter by date range
  const filterByDate = useCallback((list, dateField = 'created_at') => {
    return list.filter(item => {
      const dateVal = new Date(item[dateField]);
      if (dateCutoff && dateVal < dateCutoff) return false;
      if (dateEndCutoff && dateVal > dateEndCutoff) return false;
      return true;
    });
  }, [dateCutoff, dateEndCutoff]);

  // Filtered datasets based on date range
  const filteredJobs = useMemo(() => filterByDate(jobs), [jobs, filterByDate]);
  const filteredWorkers = useMemo(() => filterByDate(workers), [workers, filterByDate]);
  const filteredHirers = useMemo(() => filterByDate(hirers), [hirers, filterByDate]);
  const filteredPayments = useMemo(() => filterByDate(payments), [payments, filterByDate]);
  const filteredAttendance = useMemo(() => filterByDate(attendance, 'attendance_date'), [attendance, filterByDate]);

  // Transactions list (date-range filtered + status filter), newest first
  const transactions = useMemo(() => {
    return filteredPayments
      .filter(p => txStatusFilter === 'all' || p.status === txStatusFilter)
      .slice()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [filteredPayments, txStatusFilter]);

  const txStatusCounts = useMemo(() => {
    const counts = { all: filteredPayments.length };
    filteredPayments.forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1; });
    return counts;
  }, [filteredPayments]);

  // 1. Platform Overview calculations
  const platformStats = useMemo(() => {
    const totalRevenue = payments
      .filter(p => ['captured', 'paid'].includes(p.status))
      .reduce((s, p) => s + Number(p.amount || 0), 0);

    const transactionFees = payments
      .filter(p => ['captured', 'paid'].includes(p.status))
      .reduce((s, p) => s + Number(p.transaction_fee || 0), 0);

    const totalJobs = jobs.length;
    const activeWorkers = workers.filter(w => w.status === 'approved').length;
    const activeHirers = hirers.filter(h => h.status === 'active').length;
    const totalTransactions = payments.length;

    return {
      totalRevenue,
      transactionFees,
      totalJobs,
      activeWorkers,
      activeHirers,
      totalTransactions
    };
  }, [jobs, workers, hirers, payments]);

  // 2. Job Analytics calculations
  const jobStats = useMemo(() => {
    const hiring = filteredJobs.filter(j => j.status === 'hiring').length;
    const ongoing = filteredJobs.filter(j => j.status === 'ongoing').length;
    const completed = filteredJobs.filter(j => j.status === 'completed').length;
    const cancelled = filteredJobs.filter(j => j.status === 'cancelled').length;

    // Charts: Jobs by Category
    const catMap = {};
    filteredJobs.forEach(j => { catMap[j.category] = (catMap[j.category] || 0) + 1; });
    const categoryChart = Object.entries(catMap).map(([name, value]) => ({ name, value })).slice(0, 5);

    // Jobs by City
    const cityMap = {};
    filteredJobs.forEach(j => { cityMap[j.city] = (cityMap[j.city] || 0) + 1; });
    const cityChart = Object.entries(cityMap).map(([name, value]) => ({ name, value })).slice(0, 5);

    // Jobs per day / month
    const dailyMap = {};
    filteredJobs.forEach(j => {
      const key = fmtDate(j.created_at);
      dailyMap[key] = (dailyMap[key] || 0) + 1;
    });
    const dailyChart = Object.entries(dailyMap).map(([date, jobs]) => ({ date, jobs })).slice(-7);

    return { hiring, ongoing, completed, cancelled, categoryChart, cityChart, dailyChart };
  }, [filteredJobs]);

  // 3. Worker Analytics calculations
  const workerStats = useMemo(() => {
    const approved = filteredWorkers.filter(w => w.status === 'approved').length;
    const pending = filteredWorkers.filter(w => w.status === 'pending').length;
    const rejected = filteredWorkers.filter(w => w.status === 'rejected').length;
    const workingToday = Math.floor(approved * 0.35); // Estimated working ratio from approved
    const idle = approved - workingToday;

    // Workers by skill
    const skillMap = {};
    filteredWorkers.forEach(w => {
      if (w.skill_1) skillMap[w.skill_1] = (skillMap[w.skill_1] || 0) + 1;
    });
    const skillChart = Object.entries(skillMap).map(([name, value]) => ({ name, value })).slice(0, 5);

    // Workers by experience
    const expMap = {};
    filteredWorkers.forEach(w => {
      if (w.experience_level) expMap[w.experience_level] = (expMap[w.experience_level] || 0) + 1;
    });
    const expChart = Object.entries(expMap).map(([name, value]) => ({ name, value }));

    return { approved, pending, rejected, workingToday, idle, skillChart, expChart };
  }, [filteredWorkers]);

  // 4. Hirer Analytics calculations
  const hirerStats = useMemo(() => {
    const verified = filteredHirers.filter(h => h.is_verified).length;
    const active = filteredHirers.filter(h => h.status === 'active').length;
    const inactive = filteredHirers.filter(h => h.status === 'blocked').length;
    const newThisMonth = filteredHirers.filter(h => new Date(h.created_at).getMonth() === new Date().getMonth()).length;

    // Jobs posted by company
    const companyMap = {};
    jobs.forEach(j => {
      if (j.company_name) companyMap[j.company_name] = (companyMap[j.company_name] || 0) + 1;
    });
    const companyChart = Object.entries(companyMap).map(([name, value]) => ({ name, value })).slice(0, 5);

    return { verified, active, inactive, newThisMonth, companyChart };
  }, [filteredHirers, jobs]);

  // 5. Financial Analytics
  const financialStats = useMemo(() => {
    const escrowCollected = filteredPayments
      .filter(p => p.payment_type === 'escrow')
      .reduce((s, p) => s + Number(p.amount || 0), 0);

    const workersPaid = filteredPayments
      .filter(p => p.payment_type === 'payout')
      .reduce((s, p) => s + Number(p.amount || 0), 0);

    const refunds = filteredPayments
      .filter(p => p.payment_type === 'refund')
      .reduce((s, p) => s + Number(p.amount || 0), 0);

    return { escrowCollected, workersPaid, refunds };
  }, [filteredPayments]);

  // 6. Attendance Analytics calculations
  const attendanceStats = useMemo(() => {
    const total = filteredAttendance.length;
    if (total === 0) {
      return { present: 0, absent: 0, leave: 0, halfDay: 0 };
    }
    const present = Math.round((filteredAttendance.filter(a => a.status === 'present').length / total) * 100);
    const absent = Math.round((filteredAttendance.filter(a => a.status === 'absent').length / total) * 100);
    const leave = Math.round((filteredAttendance.filter(a => a.status === 'leave').length / total) * 100);
    const halfDay = Math.round((filteredAttendance.filter(a => a.status === 'half_day').length / total) * 100);

    return { present, absent, leave, halfDay };
  }, [filteredAttendance]);

  // 7. Performance & Leaderboard Analytics
  const performanceStats = useMemo(() => {
    const totalWage = jobs.reduce((s, j) => s + Number(j.wage_amount || 0), 0);
    const avgWage = jobs.length ? Math.round(totalWage / jobs.length) : 0;

    const totalWorkers = jobs.reduce((s, j) => s + Number(j.workers_required || 0), 0);
    const avgWorkers = jobs.length ? Math.round(totalWorkers / jobs.length) : 0;

    // Leaderboards
    const cityCounts = {};
    jobs.forEach(j => { if (j.city) cityCounts[j.city] = (cityCounts[j.city] || 0) + 1; });
    const topCities = Object.entries(cityCounts).sort((a, b) => b[1] - a[1]).map(e => e[0]).slice(0, 5);

    const skillCounts = {};
    workers.forEach(w => {
      [w.skill_1, w.skill_2, w.skill_3].forEach(s => {
        if (s) skillCounts[s] = (skillCounts[s] || 0) + 1;
      });
    });
    const topSkills = Object.entries(skillCounts).sort((a, b) => b[1] - a[1]).map(e => e[0]).slice(0, 5);

    const catWages = {};
    jobs.forEach(j => {
      if (j.category && j.wage_amount) {
        (catWages[j.category] ??= []).push(Number(j.wage_amount));
      }
    });
    const topPaying = Object.entries(catWages)
      .map(([cat, wages]) => ({
        category: cat,
        avgWage: Math.round(wages.reduce((s, w) => s + w, 0) / wages.length)
      }))
      .sort((a, b) => b.avgWage - a.avgWage)
      .slice(0, 5);

    // Monthly Growth dynamic calculation
    const monthlyMap = {};
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Initialize current year months
    const currentYear = new Date().getFullYear();
    const activeMonths = [];
    for (let i = 0; i <= new Date().getMonth(); i++) {
      activeMonths.push(months[i]);
      monthlyMap[months[i]] = { name: months[i], jobs: 0, workers: 0, transactions: 0 };
    }

    jobs.forEach(j => {
      const d = new Date(j.created_at);
      if (d.getFullYear() === currentYear) {
        const mName = months[d.getMonth()];
        if (monthlyMap[mName]) monthlyMap[mName].jobs += 1;
      }
    });

    workers.forEach(w => {
      const d = new Date(w.created_at);
      if (d.getFullYear() === currentYear) {
        const mName = months[d.getMonth()];
        if (monthlyMap[mName]) monthlyMap[mName].workers += 1;
      }
    });

    payments.forEach(p => {
      const d = new Date(p.created_at);
      if (d.getFullYear() === currentYear) {
        const mName = months[d.getMonth()];
        if (monthlyMap[mName]) monthlyMap[mName].transactions += 1;
      }
    });

    // Make running totals
    let runJobs = 0;
    let runWorkers = 0;
    let runTx = 0;
    const growthChart = activeMonths.map(mName => {
      runJobs += monthlyMap[mName].jobs;
      runWorkers += monthlyMap[mName].workers;
      runTx += monthlyMap[mName].transactions;
      return {
        name: mName,
        jobs: runJobs,
        workers: runWorkers,
        transactions: runTx
      };
    });

    // Calculate Monthly Financial Volume dynamically
    const financialMonthsMapping = {};
    activeMonths.forEach(mName => {
      financialMonthsMapping[mName] = { name: mName, escrow: 0, payouts: 0, refunds: 0 };
    });
    payments.forEach(p => {
      const d = new Date(p.created_at);
      if (d.getFullYear() === currentYear) {
        const mName = months[d.getMonth()];
        if (financialMonthsMapping[mName]) {
          if (p.payment_type === 'escrow') financialMonthsMapping[mName].escrow += Number(p.amount || 0);
          else if (p.payment_type === 'payout') financialMonthsMapping[mName].payouts += Number(p.amount || 0);
          else if (p.payment_type === 'refund') financialMonthsMapping[mName].refunds += Number(p.amount || 0);
        }
      }
    });
    const financialMonths = Object.values(financialMonthsMapping);

    // Calculate Financial Averages
    const payoutsList = payments.filter(p => p.payment_type === 'payout' && ['captured', 'paid'].includes(p.status));
    const totalPayoutAmount = payoutsList.reduce((s, p) => s + Number(p.amount || 0), 0);
    const uniqueDays = new Set(payoutsList.map(p => new Date(p.created_at).toDateString())).size || 1;
    const avgDailyPayout = Math.round(totalPayoutAmount / uniqueDays);

    const successful = payments.filter(p => ['captured', 'paid'].includes(p.status)).length;
    const paymentSuccessRate = payments.length ? Math.round((successful / payments.length) * 1000) / 10 : 100;

    // Calculate Attendance Trend Chart
    const attendanceDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const attendanceMapping = {};
    attendanceDays.forEach(d => {
      attendanceMapping[d] = { name: d, present: 0, absent: 0, halfDay: 0, total: 0 };
    });
    attendance.forEach(a => {
      const dateVal = new Date(a.attendance_date);
      const dayName = attendanceDays[dateVal.getDay()];
      if (attendanceMapping[dayName]) {
        attendanceMapping[dayName].total += 1;
        if (a.status === 'present') attendanceMapping[dayName].present += 1;
        else if (a.status === 'absent') attendanceMapping[dayName].absent += 1;
        else if (a.status === 'half_day') attendanceMapping[dayName].halfDay += 1;
      }
    });
    const attendanceTrend = attendanceDays.map(d => {
      const totalCount = attendanceMapping[d].total || 1;
      return {
        name: d,
        present: Math.round((attendanceMapping[d].present / totalCount) * 100),
        absent: Math.round((attendanceMapping[d].absent / totalCount) * 100),
        halfDay: Math.round((attendanceMapping[d].halfDay / totalCount) * 100),
      };
    });

    // Recent Activities Feed dynamic calculation
    const recentActivitiesList = [];
    workers.slice(0, 2).forEach(w => {
      recentActivitiesList.push({
        text: `Worker Registered: ${w.full_name}`,
        time: fmtDate(w.created_at),
        type: 'worker',
        timestamp: new Date(w.created_at).getTime()
      });
    });
    jobs.slice(0, 2).forEach(j => {
      recentActivitiesList.push({
        text: `New Job Posted: ${j.title}`,
        time: fmtDate(j.created_at),
        type: 'job',
        timestamp: new Date(j.created_at).getTime()
      });
    });
    payments.slice(0, 2).forEach(p => {
      if (p.payment_type === 'escrow') {
        recentActivitiesList.push({
          text: `Escrow Received: ${fmtMoney(p.amount)}`,
          time: fmtDate(p.created_at),
          type: 'payment',
          timestamp: new Date(p.created_at).getTime()
        });
      } else if (p.payment_type === 'refund') {
        recentActivitiesList.push({
          text: `Refund Processed: ${fmtMoney(p.amount)}`,
          time: fmtDate(p.created_at),
          type: 'refund',
          timestamp: new Date(p.created_at).getTime()
        });
      }
    });
    const recentActivities = recentActivitiesList.sort((a, b) => b.timestamp - a.timestamp).slice(0, 4);

    return { 
      avgWage, avgWorkers, topCities, topSkills, topPaying, growthChart,
      financialMonths, avgDailyPayout, paymentSuccessRate, attendanceTrend, recentActivities
    };
  }, [jobs, workers, payments, attendance]);

  // Export utility for CSV
  const handleExportCSV = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Metric,Value\n"
      + `Total Revenue,${platformStats.totalRevenue}\n`
      + `Transaction Fees,${platformStats.transactionFees}\n`
      + `Total Jobs,${platformStats.totalJobs}\n`
      + `Active Workers,${platformStats.activeWorkers}\n`
      + `Active Hirers,${platformStats.activeHirers}\n`
      + `Total Transactions,${platformStats.totalTransactions}\n`
      + `Escrow Collected,${financialStats.escrowCollected}\n`
      + `Workers Paid,${financialStats.workersPaid}\n`
      + `Refunds,${financialStats.refunds}\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Platform_Analytics_${dateRange}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col gap-8 pb-10">

      {/* Header and Exporter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-black text-3xl tracking-tight text-[var(--ink)]">Analytics Dashboard</h1>
          <p className="text-sm text-[var(--mut)] font-semibold mt-1">Platform overview, jobs distribution, financial metrics, and user growth</p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={load}
            className="glass rounded-xl px-4 py-2 h-auto gap-2 text-sm font-semibold text-[var(--mut)] hover:text-[var(--ink)]"
          >
            <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
            Refresh
          </Button>

          <Button
            onClick={handleExportCSV}
            className="gap-2 rounded-xl px-4 py-2 h-auto text-sm font-semibold border-transparent"
            style={{ background: 'var(--grad)', color: '#fff' }}
          >
            <Download size={14} /> Export CSV
          </Button>
        </div>
      </div>

      {/* Filters bar */}
      <div className="glass-card rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Filter size={15} className="text-[var(--mut)]" />
          <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--mut)]">Date Range Filter</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'today', label: 'Today' },
            { id: '7d', label: '7 Days' },
            { id: '30d', label: '30 Days' },
            { id: '90d', label: '90 Days' },
            { id: 'year', label: 'This Year' },
            { id: 'custom', label: 'Custom Range' },
          ].map(opt => (
            <Button
              key={opt.id}
              size="sm"
              variant="ghost"
              onClick={() => setDateRange(opt.id)}
              className={cn(
                'rounded-lg text-xs font-bold px-3 py-1.5 h-auto',
                dateRange === opt.id
                  ? 'text-white border-transparent shadow-md hover:text-white'
                  : 'glass text-[var(--mut)]'
              )}
              style={dateRange === opt.id ? { background: 'var(--grad)' } : {}}
            >
              {opt.label}
            </Button>
          ))}
        </div>

        {dateRange === 'custom' && (
          <div className="flex items-center gap-2 mt-2 sm:mt-0">
            <Input
              type="date"
              value={customStart}
              onChange={e => setCustomStart(e.target.value)}
              className="h-8 rounded-lg border-0 glass text-xs"
            />
            <span className="text-xs text-[var(--mut)]">to</span>
            <Input
              type="date"
              value={customEnd}
              onChange={e => setCustomEnd(e.target.value)}
              className="h-8 rounded-lg border-0 glass text-xs"
            />
          </div>
        )}
      </div>

      {/* Tabs list for sections */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-col gap-6">
        <TabsList className="h-auto w-full justify-start gap-2 rounded-xl bg-transparent p-0 overflow-x-auto">
          {[
            { id: 'overview', label: 'Platform Overview' },
            { id: 'jobs', label: 'Job Analytics' },
            { id: 'workers', label: 'Worker Analytics' },
            { id: 'hirers', label: 'Hirer Analytics' },
            { id: 'finance', label: 'Financials' },
            { id: 'transactions', label: 'Transactions' },
            { id: 'attendance', label: 'Attendance' },
          ].map(t => (
            <TabsTrigger
              key={t.id}
              value={t.id}
              className="h-auto flex-none rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider text-[var(--mut)] glass data-[state=active]:text-white data-[state=active]:border-transparent"
              style={activeTab === t.id ? { background: 'var(--grad)' } : {}}
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* 1. Platform Overview */}
        <TabsContent value="overview" className="flex flex-col gap-6 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <KPIItem label="Total Revenue" value={fmtMoney(platformStats.totalRevenue)} icon={IndianRupee} color="#7A3BFF" />
            <KPIItem label="Transaction Fees" value={fmtMoney(platformStats.transactionFees)} icon={TrendingUp} color="#16B364" />
            <KPIItem label="Total Jobs" value={platformStats.totalJobs} icon={Briefcase} color="#FF8A1E" />
            <KPIItem label="Active Workers" value={platformStats.activeWorkers} icon={Users} color="#7A3BFF" />
            <KPIItem label="Active Hirers" value={platformStats.activeHirers} icon={UserCheck} color="#16B364" />
            <KPIItem label="Total Transactions" value={platformStats.totalTransactions} icon={CreditCard} color="#C91D5E" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Leaderboard panel */}
            <div className="glass-card rounded-2xl p-5 flex flex-col gap-4">
              <h3 className="font-display font-black text-sm uppercase tracking-wider text-[var(--ink)] flex items-center gap-1.5">
                <Award size={15} className="text-[var(--saffron)]" /> Leaderboards
              </h3>
              
              <div className="flex flex-col gap-4">
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-[var(--mut)] tracking-wide">Top Cities</span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {performanceStats.topCities.length === 0 ? (
                      <span className="text-xs text-[var(--mut)]">No location data yet</span>
                    ) : performanceStats.topCities.map((c, i) => (
                      <Badge key={c} variant="outline" className="text-[10px] font-bold py-1 bg-white/40">
                        #{i + 1} {c}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-extrabold uppercase text-[var(--mut)] tracking-wide">Top Skills</span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {performanceStats.topSkills.length === 0 ? (
                      <span className="text-xs text-[var(--mut)]">No skill data yet</span>
                    ) : performanceStats.topSkills.map((s) => (
                      <Badge key={s} variant="outline" className="text-[10px] font-bold py-1 bg-white/40 border-[var(--violet)] text-[var(--violet)]">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-extrabold uppercase text-[var(--mut)] tracking-wide">Highest Paying Categories</span>
                  <div className="flex flex-col gap-2 mt-2">
                    {performanceStats.topPaying.length === 0 ? (
                      <span className="text-xs text-[var(--mut)]">No category wage data yet</span>
                    ) : performanceStats.topPaying.map(item => (
                      <PayingCategory key={item.category} label={item.category} wage={fmtMoney(item.avgWage)} />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Growth Chart */}
            <div className="glass-card rounded-2xl p-5 lg:col-span-2">
              <h3 className="font-display font-black text-sm uppercase tracking-wider text-[var(--ink)] mb-4">Growth Tracker</h3>
              <ResponsiveContainer width="100%" height={230}>
                {performanceStats.growthChart.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-xs text-[var(--mut)] font-semibold">No monthly growth data yet</div>
                ) : (
                  <AreaChart data={performanceStats.growthChart}>
                    <defs>
                      <linearGradient id="colorJobs" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#7A3BFF" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#7A3BFF" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(20,16,28,0.06)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
                    <Area type="monotone" dataKey="jobs" name="Cumulative Jobs" stroke="#7A3BFF" fillOpacity={1} fill="url(#colorJobs)" />
                    <Area type="monotone" dataKey="workers" name="Cumulative Workers" stroke="#16B364" fillOpacity={0} />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          {/* Activity Log */}
          <div className="glass-card rounded-2xl p-5">
            <h3 className="font-display font-black text-sm uppercase tracking-wider text-[var(--ink)] mb-4 flex items-center gap-1.5">
              <Clock size={15} /> Recent Activity Feed
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {performanceStats.recentActivities.length === 0 ? (
                <div className="col-span-4 text-center text-xs text-[var(--mut)] font-semibold py-4">No recent activity recorded</div>
              ) : (
                performanceStats.recentActivities.map((act, idx) => (
                  <ActivityItem key={idx} text={act.text} time={act.time} type={act.type} />
                ))
              )}
            </div>
          </div>
        </TabsContent>

        {/* 2. Job Analytics */}
        <TabsContent value="jobs" className="flex flex-col gap-6 mt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <CardStat label="Hiring Jobs" value={jobStats.hiring} color="#FF8A1E" />
            <CardStat label="Ongoing Jobs" value={jobStats.ongoing} color="#16B364" />
            <CardStat label="Completed Jobs" value={jobStats.completed} color="#7A3BFF" />
            <CardStat label="Cancelled Jobs" value={jobStats.cancelled} color="#C91D5E" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass-card rounded-2xl p-5">
              <h3 className="font-display font-black text-sm uppercase tracking-wider text-[var(--ink)] mb-4">Jobs By Category</h3>
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie data={jobStats.categoryChart} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {jobStats.categoryChart.map((entry, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="glass-card rounded-2xl p-5">
              <h3 className="font-display font-black text-sm uppercase tracking-wider text-[var(--ink)] mb-4">Jobs By City</h3>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={jobStats.cityChart} barSize={12}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(20,16,28,0.06)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" name="Jobs count" fill="#FF8A1E" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </TabsContent>

        {/* 3. Worker Analytics */}
        <TabsContent value="workers" className="flex flex-col gap-6 mt-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <CardStat label="Approved Workers" value={workerStats.approved} color="#16B364" />
            <CardStat label="Pending Approval" value={workerStats.pending} color="#FF8A1E" />
            <CardStat label="Rejected" value={workerStats.rejected} color="#C91D5E" />
            <CardStat label="Working Today" value={workerStats.workingToday} color="#7A3BFF" />
            <CardStat label="Idle Workers" value={workerStats.idle} color="var(--mut)" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass-card rounded-2xl p-5">
              <h3 className="font-display font-black text-sm uppercase tracking-wider text-[var(--ink)] mb-4">Workers by Skill</h3>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={workerStats.skillChart} layout="vertical" barSize={10}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(20,16,28,0.06)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip />
                  <Bar dataKey="value" name="Workers" fill="#7A3BFF" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="glass-card rounded-2xl p-5">
              <h3 className="font-display font-black text-sm uppercase tracking-wider text-[var(--ink)] mb-4">Workers by Experience</h3>
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie data={workerStats.expChart} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {workerStats.expChart.map((entry, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </TabsContent>

        {/* 4. Hirer Analytics */}
        <TabsContent value="hirers" className="flex flex-col gap-6 mt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <CardStat label="Verified Hirers" value={hirerStats.verified} color="#16B364" />
            <CardStat label="Active Hirers" value={hirerStats.active} color="#7A3BFF" />
            <CardStat label="Inactive Hirers" value={hirerStats.inactive} color="#C91D5E" />
            <CardStat label="New Hirers (Month)" value={hirerStats.newThisMonth} color="#FF8A1E" />
          </div>

          <div className="grid grid-cols-1 gap-6">
            <div className="glass-card rounded-2xl p-5">
              <h3 className="font-display font-black text-sm uppercase tracking-wider text-[var(--ink)] mb-4">Jobs Posted by Company</h3>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={hirerStats.companyChart} barSize={14}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(20,16,28,0.06)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" name="Jobs count" fill="#16B364" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </TabsContent>

        {/* 5. Financial Analytics */}
        <TabsContent value="finance" className="flex flex-col gap-6 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KPIItem label="Escrow Collected" value={fmtMoney(financialStats.escrowCollected)} icon={IndianRupee} color="#7A3BFF" />
            <KPIItem label="Workers Paid" value={fmtMoney(financialStats.workersPaid)} icon={UserCheck} color="#16B364" />
            <KPIItem label="Refunds Issued" value={fmtMoney(financialStats.refunds)} icon={ShieldAlert} color="#C91D5E" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass-card rounded-2xl p-5">
              <h3 className="font-display font-black text-sm uppercase tracking-wider text-[var(--ink)] mb-4">Monthly Financial Volume</h3>
              <ResponsiveContainer width="100%" height={230}>
                {performanceStats.financialMonths.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-xs text-[var(--mut)] font-semibold">No monthly financial records found</div>
                ) : (
                  <BarChart data={performanceStats.financialMonths} barSize={10} barGap={3}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(20,16,28,0.06)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => fmtMoney(v)} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="escrow" name="Escrow" fill="#7A3BFF" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="payouts" name="Payouts" fill="#16B364" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="refunds" name="Refunds" fill="#C91D5E" radius={[4, 4, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>

            <div className="glass-card rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <h3 className="font-display font-black text-sm uppercase tracking-wider text-[var(--ink)] mb-4">Financial Averages</h3>
                <p className="text-xs text-[var(--mut)] font-semibold mb-5">Aggregate transaction performance stats</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl glass p-4 text-center">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--mut)] block mb-1">Average Daily Payout</span>
                  <span className="font-display font-black text-2xl text-[var(--ink)]">{fmtMoney(performanceStats.avgDailyPayout)}</span>
                </div>
                <div className="rounded-2xl glass p-4 text-center">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--mut)] block mb-1">Payment Success Rate</span>
                  <span className="font-display font-black text-2xl text-[var(--green)]">{performanceStats.paymentSuccessRate}%</span>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* 6. Transactions */}
        <TabsContent value="transactions" className="flex flex-col gap-6 mt-4">
          {/* Status filter */}
          <div className="glass-card rounded-2xl p-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter size={15} className="text-[var(--mut)]" />
              <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--mut)]">Status</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {TX_STATUSES.map(status => (
                <Button
                  key={status}
                  size="sm"
                  variant="ghost"
                  onClick={() => setTxStatusFilter(status)}
                  className={cn(
                    'rounded-lg text-xs font-bold px-3 py-1.5 h-auto capitalize',
                    txStatusFilter === status
                      ? 'text-white border-transparent shadow-md hover:text-white'
                      : 'glass text-[var(--mut)]'
                  )}
                  style={txStatusFilter === status ? { background: 'var(--grad)' } : {}}
                >
                  {status} ({txStatusCounts[status] || 0})
                </Button>
              ))}
            </div>
          </div>

          {/* Transactions table */}
          <div className="glass-card rounded-2xl p-5">
            <h3 className="font-display font-black text-sm uppercase tracking-wider text-[var(--ink)] mb-4 flex items-center gap-1.5">
              <CreditCard size={15} /> All Transactions
              <span className="ml-auto text-[10px] font-bold text-[var(--mut)] normal-case tracking-normal">
                {transactions.length} record{transactions.length === 1 ? '' : 's'} · respects date range filter
              </span>
            </h3>

            {transactions.length === 0 ? (
              <div className="text-center text-xs text-[var(--mut)] font-semibold py-8">
                No transactions found for this date range and status.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[var(--divider)]">
                      {['Payment ID', 'Date', 'Type', 'Method', 'Amount', 'Txn Fee', 'Total Charged', 'Status'].map(h => (
                        <th key={h} className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--mut)] py-2.5 pr-4 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map(p => (
                      <tr key={p.id} className="border-b border-[var(--divider)] last:border-0 hover:bg-white/40">
                        <td className="py-2.5 pr-4 text-xs font-bold text-[var(--ink)] whitespace-nowrap font-mono">{p.payment_id}</td>
                        <td className="py-2.5 pr-4 text-xs font-semibold text-[var(--mut)] whitespace-nowrap">{fmtDateTime(p.paid_at || p.created_at)}</td>
                        <td className="py-2.5 pr-4 text-xs font-semibold text-[var(--ink)] capitalize whitespace-nowrap">{(p.payment_type || '—').replace('_', ' ')}</td>
                        <td className="py-2.5 pr-4 text-xs font-semibold text-[var(--mut)] uppercase whitespace-nowrap">{p.payment_method || '—'}</td>
                        <td className="py-2.5 pr-4 text-xs font-bold text-[var(--ink)] whitespace-nowrap">{fmtMoneyExact(p.amount)}</td>
                        <td className="py-2.5 pr-4 text-xs font-semibold text-[var(--mut)] whitespace-nowrap">{fmtMoneyExact(p.transaction_fee)}</td>
                        <td className="py-2.5 pr-4 text-xs font-bold text-[var(--ink)] whitespace-nowrap">{fmtMoneyExact(Number(p.amount || 0) + Number(p.transaction_fee || 0))}</td>
                        <td className="py-2.5 pr-4"><TxStatusBadge status={p.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* 7. Attendance Analytics */}
        <TabsContent value="attendance" className="flex flex-col gap-6 mt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <CardPercent label="Present Rate" value={attendanceStats.present} color="#16B364" />
            <CardPercent label="Absent Rate" value={attendanceStats.absent} color="#C91D5E" />
            <CardPercent label="Leave Rate" value={attendanceStats.leave} color="#FF8A1E" />
            <CardPercent label="Half Day Rate" value={attendanceStats.halfDay} color="#7A3BFF" />
          </div>

          <div className="grid grid-cols-1 gap-6">
            <div className="glass-card rounded-2xl p-5">
              <h3 className="font-display font-black text-sm uppercase tracking-wider text-[var(--ink)] mb-4">Attendance Trend</h3>
              <ResponsiveContainer width="100%" height={230}>
                {attendance.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-xs text-[var(--mut)] font-semibold">No attendance entries registered yet</div>
                ) : (
                  <AreaChart data={performanceStats.attendanceTrend}>
                    <defs>
                      <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#16B364" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#16B364" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(20,16,28,0.06)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                    <Tooltip />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="present" name="Present %" stroke="#16B364" fillOpacity={1} fill="url(#colorPresent)" />
                    <Area type="monotone" dataKey="absent" name="Absent %" stroke="#C91D5E" fillOpacity={0} />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        </TabsContent>
      </Tabs>

    </div>
  );
}

function TxStatusBadge({ status }) {
  const styles = {
    captured: { bg: '#16B36418', color: '#16B364', Icon: CheckCircle2 },
    paid:     { bg: '#16B36418', color: '#16B364', Icon: CheckCircle2 },
    created:  { bg: '#FF8A1E18', color: '#FF8A1E', Icon: Clock },
    pending:  { bg: '#FF8A1E18', color: '#FF8A1E', Icon: Clock },
    authorized: { bg: '#7A3BFF18', color: '#7A3BFF', Icon: Clock },
    failed:   { bg: '#C91D5E18', color: '#C91D5E', Icon: XCircle },
    refunded: { bg: '#7A3BFF18', color: '#7A3BFF', Icon: AlertCircle },
  };
  const s = styles[status] ?? { bg: 'rgba(20,16,28,0.06)', color: 'var(--mut)', Icon: AlertCircle };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}
    >
      <s.Icon size={11} strokeWidth={2.5} /> {status || 'unknown'}
    </span>
  );
}

function KPIItem({ label, value, icon: Icon, color }) {
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

function CardStat({ label, value, color }) {
  return (
    <div className="rounded-xl glass border border-[var(--divider)] p-4">
      <span className="text-[10px] font-bold uppercase text-[var(--mut)] block mb-1">{label}</span>
      <span className="font-display font-black text-2xl" style={{ color }}>{value}</span>
    </div>
  );
}

function CardPercent({ label, value, color }) {
  return (
    <div className="rounded-xl glass border border-[var(--divider)] p-4 text-center">
      <span className="text-[10px] font-bold uppercase text-[var(--mut)] block mb-1">{label}</span>
      <span className="font-display font-black text-3xl" style={{ color }}>{value}%</span>
    </div>
  );
}

function PayingCategory({ label, wage }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--divider)] pb-1.5">
      <span className="text-xs font-semibold text-[var(--ink)]">{label}</span>
      <span className="text-xs font-bold text-[var(--violet)]">{wage}/day</span>
    </div>
  );
}

function ActivityItem({ text, time, type }) {
  const colorMap = {
    worker: 'bg-[#7A3BFF]',
    job: 'bg-[#FF8A1E]',
    refund: 'bg-[#C91D5E]',
    payment: 'bg-[#16B364]'
  };

  return (
    <div className="rounded-xl glass p-3 border border-[var(--divider)] flex items-start gap-2.5">
      <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', colorMap[type])} />
      <div>
        <span className="text-xs font-semibold text-[var(--ink)] block leading-snug">{text}</span>
        <span className="text-[10px] font-bold text-[var(--mut)] block mt-0.5">{time}</span>
      </div>
    </div>
  );
}
