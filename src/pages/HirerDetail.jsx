import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  ArrowLeft, Loader2, Phone, Mail, MapPin, Building2, User,
  Eye, EyeOff, Landmark, ScrollText, AlertTriangle,
} from 'lucide-react';

const STATUS_BADGE = {
  pending: 'badge badge-orange',
  active:  'badge badge-green',
  blocked: 'badge badge-red',
};

const JOB_STATUS_COLOR = {
  hiring:    'var(--saffron)',
  ongoing:   'var(--violet)',
  completed: 'var(--green)',
  cancelled: 'var(--accent)',
};

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtMoney = (n) => n != null ? `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—';

export default function HirerDetail({ hirerId, onNav, onBack }) {
  const [hirer,    setHirer]    = useState(null);
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

    const [hirerRes, accountsRes, jobsRes] = await Promise.all([
      supabase.from('hirers').select('*').eq('id', hirerId).single(),
      supabase.from('hirer_bank_accounts').select('*').eq('hirer_id', hirerId),
      supabase
        .from('jobs')
        .select('id, job_id, title, city, status, workers_required, selected_workers_count, escrow_amount, escrow_status, created_at')
        .eq('hirer_id', hirerId)
        .order('created_at', { ascending: false }),
    ]);

    if (hirerRes.error || !hirerRes.data) {
      setNotFound(true);
    } else {
      setHirer(hirerRes.data);
    }

    if (accountsRes.error) console.error('[hirer_bank_accounts]', accountsRes.error.message);
    setAccounts(accountsRes.data ?? []);

    if (jobsRes.error) {
      console.error('[jobs]', jobsRes.error.message);
      setJobsError(jobsRes.error.message);
    }
    setJobs(jobsRes.data ?? []);
    setLoading(false);
  }, [hirerId]);

  useEffect(() => { load(); }, [load]);

  const toggleAccountReveal = (id) => {
    setRevealedAccounts(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const fullName = hirer ? `${hirer.first_name} ${hirer.last_name}` : '';

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
          <h1 className="font-display font-black text-3xl tracking-tight text-[var(--ink)]">Hirer Profile</h1>
          <p className="text-sm text-[var(--mut)] font-semibold mt-1">Full registration, banking and job posting history</p>
        </div>
      </div>

      {loading ? (
        <div className="glass-card rounded-2xl flex items-center justify-center py-24 gap-3 text-[var(--mut)]">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm font-semibold">Loading hirer…</span>
        </div>
      ) : notFound ? (
        <div className="glass-card rounded-2xl flex flex-col items-center justify-center py-24 gap-2">
          <p className="text-[var(--mut)] font-semibold text-sm">Hirer not found.</p>
        </div>
      ) : (
        <>
          {/* Profile card */}
          <div className="glass-card rounded-2xl p-6 flex flex-col sm:flex-row gap-6">
            <div className="w-24 h-24 rounded-2xl overflow-hidden flex-shrink-0 bg-slate-100 border border-[var(--divider)] flex items-center justify-center">
              {hirer.entity_type === 'Individual'
                ? <User size={32} className="text-[var(--mut)]" />
                : <Building2 size={32} className="text-[var(--mut)]" />
              }
            </div>

            <div className="flex-1 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-display font-bold text-2xl text-[var(--ink)]">{fullName}</h2>
                <span className={STATUS_BADGE[hirer.status] ?? 'badge badge-gray'}>{hirer.status}</span>
                {hirer.hirer_id && <span className="text-xs font-semibold text-[var(--mut)]">{hirer.hirer_id}</span>}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <InfoItem icon={Phone} label="Mobile" value={hirer.mobile_no} />
                <InfoItem icon={Mail} label="Email" value={hirer.email ?? '—'} />
                <InfoItem icon={MapPin} label="Location" value={[hirer.city, hirer.state].filter(Boolean).join(', ') || '—'} />
                <InfoItem icon={Building2} label="Entity Type" value={hirer.entity_type ?? '—'} />
                <InfoItem label="Company Name" value={hirer.company_name ?? '—'} />
                <InfoItem label="GST Number" value={hirer.gst_number ?? '—'} />
                <InfoItem label="Registered" value={fmtDate(hirer.created_at)} />
                <InfoItem label="Verified" value={hirer.is_verified ? '✅ Yes' : '❌ No'} />
                {hirer.status === 'blocked' && hirer.rejection_reason && (
                  <InfoItem label="Block Reason" value={hirer.rejection_reason} />
                )}
              </div>

              {hirer.aadhar_url && (
                <div className="flex flex-wrap gap-4 mt-1">
                  <a href={hirer.aadhar_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-[var(--rani)] hover:underline">
                    <Eye size={12} /> View Aadhaar
                  </a>
                </div>
              )}
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

          {/* Jobs posted */}
          <div className="glass-card rounded-2xl p-6">
            <h3 className="font-display font-bold text-lg text-[var(--ink)] mb-4 flex items-center gap-2">
              <ScrollText size={17} /> Jobs Posted
            </h3>
            {jobsError ? (
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--accent)]">
                <AlertTriangle size={15} />
                Couldn't load job postings — {jobsError}
              </div>
            ) : jobs.length === 0 ? (
              <p className="text-sm text-[var(--mut)] font-semibold">This hirer hasn't posted any jobs yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>Title</th>
                      <th>City</th>
                      <th>Workers</th>
                      <th>Escrow</th>
                      <th>Status</th>
                      <th>Posted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map(j => (
                      <tr
                        key={j.id}
                        onClick={() => onNav?.(`job-detail/${j.id}`)}
                        className="cursor-pointer hover:bg-black/[0.02]"
                      >
                        <td className="font-semibold text-[var(--ink)] text-sm">{j.job_id}</td>
                        <td className="text-[var(--mut)] text-xs font-semibold max-w-[180px] truncate">{j.title}</td>
                        <td className="text-[var(--mut)] text-xs font-semibold">{j.city ?? '—'}</td>
                        <td className="text-[var(--mut)] text-xs font-semibold">{j.selected_workers_count} / {j.workers_required}</td>
                        <td className="text-[var(--mut)] text-xs font-semibold">{fmtMoney(j.escrow_amount)}</td>
                        <td>
                          <span
                            className="badge capitalize"
                            style={{
                              background: `color-mix(in srgb, ${JOB_STATUS_COLOR[j.status] ?? 'var(--mut)'} 14%, transparent)`,
                              color: JOB_STATUS_COLOR[j.status] ?? 'var(--mut)',
                            }}
                          >
                            {j.status}
                          </span>
                        </td>
                        <td className="text-[var(--mut)] text-xs">{fmtDate(j.created_at)}</td>
                      </tr>
                    ))}
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
