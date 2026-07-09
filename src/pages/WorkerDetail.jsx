import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  ArrowLeft, Loader2, Phone, MapPin, Cake, Briefcase, IndianRupee,
  Eye, EyeOff, Landmark, CheckCircle2, Clock, ScrollText, AlertTriangle,
} from 'lucide-react';

const STATUS_BADGE = {
  pending:  'badge badge-orange',
  approved: 'badge badge-green',
  rejected: 'badge badge-red',
};

const JOB_STATUS_COLOR = {
  assigned:  'var(--saffron)',
  working:   'var(--violet)',
  completed: 'var(--green)',
  cancelled: 'var(--accent)',
};

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtMoney = (n) => n != null ? `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—';

// Payout rows only exist once an admin actually initiates a payout in
// Settlements. Until then, estimate what the worker is owed from the job's
// daily wage × days worked (start → completion, or start → today if still
// ongoing) so the table isn't just blank for every unpaid job.
const estimatePayout = (jw) => {
  const wage = jw.jobs?.wage_amount;
  const start = jw.started_at ?? jw.joined_at;
  if (!wage || !start) return null;

  const end = jw.completed_at ? new Date(jw.completed_at) : new Date();
  const days = Math.max(1, Math.round((end - new Date(start)) / (1000 * 60 * 60 * 24)) + 1);
  return Number(wage) * days;
};

export default function WorkerDetail({ workerId, onNav, onBack }) {
  const [worker,   setWorker]   = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [jobs,      setJobs]    = useState([]);
  const [loading,   setLoading] = useState(true);
  const [notFound,  setNotFound] = useState(false);
  const [jobsError, setJobsError] = useState(null);
  const [revealedAccounts, setRevealedAccounts] = useState(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    setJobsError(null);

    const [workerRes, accountsRes, jobsRes] = await Promise.all([
      supabase.from('labourers').select('*').eq('id', workerId).single(),
      supabase.from('labourer_bank_accounts').select('*').eq('labourer_id', workerId),
      supabase
        .from('job_workers')
        .select('id, status, joined_at, started_at, completed_at, payment_status, jobs(id, job_id, title, city, status, wage_amount), worker_payouts!job_worker_id(net_amount, payment_status, paid_at)')
        .eq('labourer_id', workerId)
        .order('joined_at', { ascending: false }),
    ]);

    if (workerRes.error || !workerRes.data) {
      setNotFound(true);
    } else {
      setWorker(workerRes.data);
    }

    if (accountsRes.error) console.error('[labourer_bank_accounts]', accountsRes.error.message);
    setAccounts(accountsRes.data ?? []);

    if (jobsRes.error) {
      console.error('[job_workers]', jobsRes.error.message);
      setJobsError(jobsRes.error.message);
    }
    setJobs(jobsRes.data ?? []);
    setLoading(false);
  }, [workerId]);

  useEffect(() => { load(); }, [load]);

  const toggleAccountReveal = (id) => {
    setRevealedAccounts(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const skills = worker ? [worker.skill_1, worker.skill_2, worker.skill_3].filter(Boolean) : [];

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-xl flex items-center justify-center glass text-[var(--mut)] hover:text-[var(--ink)] transition-colors cursor-pointer flex-shrink-0"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="font-display font-black text-3xl tracking-tight text-[var(--ink)]">Worker Profile</h1>
          <p className="text-sm text-[var(--mut)] font-semibold mt-1">Full registration, skills, banking and job history</p>
        </div>
      </div>

      {loading ? (
        <div className="glass-card rounded-2xl flex items-center justify-center py-24 gap-3 text-[var(--mut)]">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm font-semibold">Loading worker…</span>
        </div>
      ) : notFound ? (
        <div className="glass-card rounded-2xl flex flex-col items-center justify-center py-24 gap-2">
          <p className="text-[var(--mut)] font-semibold text-sm">Worker not found.</p>
        </div>
      ) : (
        <>
          {/* Profile card */}
          <div className="glass-card rounded-2xl p-6 flex flex-col sm:flex-row gap-6">
            <div className="w-24 h-24 rounded-2xl overflow-hidden flex-shrink-0 bg-slate-100 border border-[var(--divider)]">
              {worker.photo_url
                ? <img src={worker.photo_url} className="w-full h-full object-cover" alt={worker.full_name} />
                : <div className="w-full h-full flex items-center justify-center text-2xl font-black text-[var(--mut)]">
                    {worker.full_name?.[0]?.toUpperCase() ?? '?'}
                  </div>
              }
            </div>

            <div className="flex-1 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-display font-bold text-2xl text-[var(--ink)]">{worker.full_name}</h2>
                <span className={STATUS_BADGE[worker.status] ?? 'badge badge-gray'}>{worker.status}</span>
                {worker.labour_id && <span className="text-xs font-semibold text-[var(--mut)]">{worker.labour_id}</span>}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <InfoItem icon={Phone} label="Mobile" value={worker.mobile_no} />
                <InfoItem icon={Cake} label="Date of Birth" value={fmtDate(worker.date_of_birth)} />
                <InfoItem icon={MapPin} label="Location" value={[worker.city, worker.state].filter(Boolean).join(', ') || '—'} />
                <InfoItem icon={Briefcase} label="Experience" value={worker.experience_level ?? '—'} />
                <InfoItem icon={IndianRupee} label="Daily Wage" value={fmtMoney(worker.daily_wage)} />
                <InfoItem label="Gender" value={worker.gender ?? '—'} />
                <InfoItem label="Registered" value={fmtDate(worker.created_at)} />
                {worker.status === 'rejected' && worker.rejection_reason && (
                  <InfoItem label="Rejection Reason" value={worker.rejection_reason} />
                )}
              </div>

              {skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {skills.map(s => (
                    <span key={s} className="px-2.5 py-1 rounded-full bg-black/[0.04] text-xs font-bold text-[var(--ink)]">{s}</span>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-4 mt-1">
                {worker.photo_url && (
                  <a href={worker.photo_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-[var(--rani)] hover:underline">
                    <Eye size={12} /> View Photo
                  </a>
                )}
                {worker.government_id_url && (
                  <a href={worker.government_id_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-[var(--rani)] hover:underline">
                    <Eye size={12} /> View Government ID
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Bank accounts */}
          <div className="glass-card rounded-2xl p-6">
            <h3 className="font-display font-bold text-lg text-[var(--ink)] mb-4 flex items-center gap-2">
              <Landmark size={17} /> Bank Accounts
            </h3>
            {accounts.length === 0 ? (
              <p className="text-sm text-[var(--mut)] font-semibold">No bank account on file.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {accounts.map(a => {
                  const revealed = revealedAccounts.has(a.id);
                  return (
                    <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black/[0.02] px-4 py-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 flex-1 min-w-[260px]">
                        <InfoItem label="Account Holder" value={a.account_holder_name} />
                        <InfoItem
                          label="Account Number"
                          value={
                            <span className="flex items-center gap-1.5">
                              <span className="font-mono">
                                {revealed ? a.account_number : `••••••${String(a.account_number).slice(-4)}`}
                              </span>
                              <button
                                onClick={() => toggleAccountReveal(a.id)}
                                className="text-[var(--mut)] hover:text-[var(--ink)] cursor-pointer"
                                title={revealed ? 'Hide account number' : 'Show account number'}
                              >
                                {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
                              </button>
                            </span>
                          }
                        />
                        <InfoItem label="IFSC" value={a.ifsc_code} />
                        <InfoItem label="Bank" value={a.bank_name ?? '—'} />
                        <InfoItem label="Branch" value={a.branch_name ?? '—'} />
                        <InfoItem label="Account Type" value={a.account_type ?? '—'} />
                        <InfoItem label="UPI ID" value={a.upi_id ?? '—'} />
                        <InfoItem label="Verification Method" value={a.verification_method ?? '—'} />
                      </div>
                      <span className={a.is_verified ? 'badge badge-green' : 'badge badge-orange'}>
                        {a.is_verified ? 'Verified' : 'Pending'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Job history */}
          <div className="glass-card rounded-2xl p-6">
            <h3 className="font-display font-bold text-lg text-[var(--ink)] mb-4 flex items-center gap-2">
              <ScrollText size={17} /> Job History
            </h3>
            {jobsError ? (
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--accent)]">
                <AlertTriangle size={15} />
                Couldn't load job history — {jobsError}
              </div>
            ) : jobs.length === 0 ? (
              <p className="text-sm text-[var(--mut)] font-semibold">This worker hasn't been assigned to any jobs yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>City</th>
                      <th>Joined</th>
                      <th>Completed</th>
                      <th>Status</th>
                      <th>Payout</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map(jw => {
                      const payout = Array.isArray(jw.worker_payouts) ? jw.worker_payouts[0] : jw.worker_payouts;
                      const status = payout?.payment_status ?? jw.payment_status ?? 'pending';
                      const amount = payout?.net_amount ?? estimatePayout(jw);
                      const isEstimate = payout?.net_amount == null && amount != null;
                      return (
                      <tr
                        key={jw.id}
                        onClick={() => jw.jobs?.id && onNav?.(`job-detail/${jw.jobs.id}`)}
                        className={jw.jobs?.id ? 'cursor-pointer hover:bg-black/[0.02]' : ''}
                      >
                        <td className="font-semibold text-[var(--ink)] text-sm">{jw.jobs?.job_id ?? '—'}</td>
                        <td className="text-[var(--mut)] text-xs font-semibold">{jw.jobs?.city ?? '—'}</td>
                        <td className="text-[var(--mut)] text-xs">{fmtDate(jw.joined_at)}</td>
                        <td className="text-[var(--mut)] text-xs">
                          {jw.completed_at ? fmtDate(jw.completed_at) : <span className="italic">Ongoing</span>}
                        </td>
                        <td>
                          <span
                            className="badge"
                            style={{
                              background: `color-mix(in srgb, ${JOB_STATUS_COLOR[jw.status] ?? 'var(--mut)'} 14%, transparent)`,
                              color: JOB_STATUS_COLOR[jw.status] ?? 'var(--mut)',
                            }}
                          >
                            {jw.status}
                          </span>
                        </td>
                        <td className="text-xs font-semibold">
                          <span className="flex items-center gap-1">
                            {status === 'paid'
                              ? <CheckCircle2 size={12} className="text-[var(--green)]" />
                              : <Clock size={12} className="text-[var(--saffron)]" />
                            }
                            {fmtMoney(amount)}
                            <span className="text-[var(--mut)] capitalize">
                              ({status}{isEstimate ? ' · est.' : ''})
                            </span>
                          </span>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function InfoItem({ icon: Icon, label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--mut)] flex items-center gap-1">
        {Icon && <Icon size={11} />} {label}
      </span>
      <span className="text-sm font-semibold text-[var(--ink)]">{value}</span>
    </div>
  );
}
