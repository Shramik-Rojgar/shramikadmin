import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  ArrowLeft, Loader2, Calendar, MapPin, Building2, Map, Briefcase,
  CheckCircle2, AlertTriangle, Pause, XCircle, ArrowRight,
} from 'lucide-react';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const fmtMoney = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtDate  = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const hirerName = (h) => h ? ([h.first_name, h.last_name].filter(Boolean).join(' ') || h.company_name || '—') : '—';

const STATUS_COLORS = {
  hiring: { bg: 'bg-[#FF8A1E]/10 text-[#FF8A1E]', label: '🟡 Hiring' },
  ongoing: { bg: 'bg-[#16B364]/10 text-[#16B364]', label: '🟢 Ongoing' },
  completed: { bg: 'bg-[#7A3BFF]/10 text-[#7A3BFF]', label: '🔵 Completed' },
  cancelled: { bg: 'bg-[#C91D5E]/10 text-[#C91D5E]', label: '🔴 Cancelled' },
};

export default function JobDetail({ jobId, onBack }) {
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [jobWorkers, setJobWorkers] = useState([]);
  const [jobApplications, setJobApplications] = useState([]);
  const [jobHireRequests, setJobHireRequests] = useState([]);
  const [jobAttendance, setJobAttendance] = useState([]);

  const [selectedWorker, setSelectedWorker] = useState(null);
  const [workerAttendanceList, setWorkerAttendanceList] = useState([]);
  const [workerAttendanceOpen, setWorkerAttendanceOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // { type } | null
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);

    const jobRes = await supabase.from('jobs').select('*, hirers(*)').eq('id', jobId).single();

    if (jobRes.error || !jobRes.data) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setJob(jobRes.data);

    const [jwRes, appsRes, hrsRes] = await Promise.all([
      supabase.from('job_workers').select('*, labourers(*)').eq('job_id', jobId),
      supabase.from('job_applications').select('*').eq('job_id', jobId),
      supabase.from('job_hire_requests').select('*').eq('job_id', jobId),
    ]);

    const workerIds = (jwRes.data ?? []).map(w => w.id);
    let attRes = { data: [] };
    if (workerIds.length > 0) {
      attRes = await supabase.from('attendance').select('*').in('job_worker_id', workerIds);
    }

    setJobWorkers(jwRes.data ?? []);
    setJobApplications(appsRes.data ?? []);
    setJobHireRequests(hrsRes.data ?? []);
    setJobAttendance(attRes.data ?? []);
    setLoading(false);
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  const workerDetail = useMemo(() => {
    if (!selectedWorker) return null;
    const workerAssigned = jobWorkers.find(jw => jw.id === selectedWorker.id);
    const workerAttendance = jobAttendance.filter(a => a.job_worker_id === selectedWorker.id);
    const present = workerAttendance.filter(a => a.status === 'present').length;
    const absent = workerAttendance.filter(a => a.status === 'absent').length;
    const halfDay = workerAttendance.filter(a => a.status === 'half_day').length;
    return { workerAssigned, attendanceSummary: { present, absent, halfDay }, history: workerAttendance };
  }, [selectedWorker, jobWorkers, jobAttendance]);

  const handleAdminAction = async () => {
    if (!confirmAction || !job) return;
    setActing(true);

    let updatePayload = {};
    if (confirmAction.type === 'close')  updatePayload = { status: 'cancelled' };
    if (confirmAction.type === 'pause')  updatePayload = { status: 'hiring' };
    if (confirmAction.type === 'cancel') updatePayload = { status: 'cancelled' };

    const { error } = await supabase.from('jobs').update(updatePayload).eq('id', job.id);
    if (error) {
      alert('Error updating job status: ' + error.message);
    } else {
      load();
    }
    setActing(false);
    setConfirmAction(null);
  };

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
          <h1 className="font-display font-black text-3xl tracking-tight text-[var(--ink)]">Job Details</h1>
          <p className="text-sm text-[var(--mut)] font-semibold mt-1">Full job posting, hirer, escrow and worker information</p>
        </div>
      </div>

      {loading ? (
        <div className="glass-card rounded-2xl flex items-center justify-center py-24 gap-3 text-[var(--mut)]">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm font-semibold">Loading job…</span>
        </div>
      ) : notFound ? (
        <div className="glass-card rounded-2xl flex flex-col items-center justify-center py-24 gap-2">
          <p className="text-[var(--mut)] font-semibold text-sm">Job not found.</p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-6 flex flex-col gap-6">

          <div className="flex items-center gap-3 border-b border-[var(--divider)] pb-4">
            <h2 className="font-display text-2xl font-black text-[var(--ink)]">{job.job_id}</h2>
            <span className={cn('px-2.5 py-1 text-[10px] font-extrabold uppercase rounded-full tracking-wider', STATUS_COLORS[job.status]?.bg)}>
              {STATUS_COLORS[job.status]?.label ?? job.status}
            </span>
            <span className="text-xs font-semibold text-[var(--mut)] ml-auto">Posted on {fmtDate(job.created_at)}</span>
          </div>

          {/* Timeline */}
          <div className="rounded-xl glass p-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--mut)] mb-3">Job Timeline</h3>
            <div className="flex items-center justify-between text-[10px] font-bold text-[var(--mut)] gap-1 overflow-x-auto py-1">
              <TimelineNode label="Created" checked />
              <ArrowRight size={10} />
              <TimelineNode label="Escrow Paid" checked={job.escrow_status === 'funded'} />
              <ArrowRight size={10} />
              <TimelineNode label="Published" checked={!!job.published_at} />
              <ArrowRight size={10} />
              <TimelineNode label="Workers Joined" checked={jobWorkers.length > 0} />
              <ArrowRight size={10} />
              <TimelineNode label="Started" checked={job.status === 'ongoing' || job.status === 'completed'} />
              <ArrowRight size={10} />
              <TimelineNode label="Completed" checked={job.status === 'completed'} />
            </div>
          </div>

          {/* Basic Information */}
          <Section icon={Briefcase} title="Basic Information">
            <InfoPair label="Title" value={job.title} />
            <InfoPair label="Category" value={job.category} />
            <InfoPair label="Created At" value={fmtDate(job.created_at)} />
            <InfoPair label="Published At" value={fmtDate(job.published_at)} />
            <div className="col-span-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--mut)] block mb-0.5">Description</span>
              <p className="text-xs font-semibold text-[var(--ink)] leading-relaxed">{job.description || 'No description provided.'}</p>
            </div>
          </Section>

          {/* Hirer Information */}
          <Section icon={Building2} title="Hirer Information">
            <InfoPair label="Company Name" value={job.company_name || '—'} />
            <InfoPair label="Contact Person" value={hirerName(job.hirers)} />
            <InfoPair label="Phone" value={job.contact_phone} />
            <InfoPair label="Email" value={job.hirers?.email || '—'} />
            <InfoPair label="Address" value={job.address} />
            <InfoPair label="GST / Aadhaar Verified" value={job.hirers?.is_verified ? '✅ Yes' : '❌ No'} />
          </Section>

          {/* Job specifications */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--mut)] mb-2.5 flex items-center gap-2">
              <Calendar size={12} /> Job Information
            </h3>
            <div className="grid grid-cols-3 gap-4 bg-white/40 rounded-xl p-4 border border-[var(--divider)]">
              <InfoPair label="Workers Required" value={job.workers_required} />
              <InfoPair label="Workers Selected" value={job.selected_workers_count} />
              <InfoPair label="Experience Required" value={job.experience_required} />
              <InfoPair label="Daily Wage" value={fmtMoney(job.wage_amount)} />
              <InfoPair label="Estimated Days" value={job.estimated_days} />
              <InfoPair label="Estimated Total" value={fmtMoney(job.estimated_total_amount)} />
              <InfoPair label="Start Date" value={fmtDate(job.work_start_date)} />
              <InfoPair label="Expected End Date" value={fmtDate(job.expected_end_date)} />
            </div>
          </div>

          {/* Location */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--mut)] mb-2.5 flex items-center gap-2">
              <MapPin size={12} /> Location
            </h3>
            <div className="grid grid-cols-2 gap-4 bg-white/40 rounded-xl p-4 border border-[var(--divider)]">
              <InfoPair label="State" value={job.state} />
              <InfoPair label="City" value={job.city} />
              <InfoPair label="Locality" value={job.locality || '—'} />
              <InfoPair label="Pincode" value={job.pincode || '—'} />
              <div className="col-span-2">
                <InfoPair label="Full Address" value={job.address} />
              </div>
              {job.latitude && (
                <div className="col-span-2 mt-1">
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${job.latitude},${job.longitude}`}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[var(--violet)] hover:underline"
                  >
                    <Map size={12} /> View on Google Maps ({job.latitude.toFixed(4)}, {job.longitude.toFixed(4)})
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Facilities */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--mut)] mb-2">Facilities</h3>
            <div className="flex flex-wrap gap-2">
              <FacilityBadge label="Accommodation" active={job.accommodation} />
              <FacilityBadge label="Food" active={job.food} />
              <FacilityBadge label="Transport" active={job.transport} />
              <FacilityBadge label="Safety Equipment" active={job.safety_equipment} />
              <FacilityBadge label="Overtime" active={job.overtime_available} />
            </div>
          </div>

          {/* Payment info */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--mut)] mb-2.5">Payment Details</h3>
            <div className="grid grid-cols-2 gap-4 bg-white/40 rounded-xl p-4 border border-[var(--divider)]">
              <InfoPair label="Escrow Amount" value={fmtMoney(job.escrow_amount)} />
              <InfoPair label="Escrow Status" value={job.escrow_status || 'pending'} />
              <InfoPair label="Refunded Amount" value={fmtMoney(job.refunded_amount)} />
              <InfoPair label="Actual Total Amount" value={fmtMoney(job.actual_total_amount)} />
            </div>
          </div>

          {/* Hiring Progress */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--mut)] mb-2.5">Hiring Progress</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/40 rounded-xl p-4 border border-[var(--divider)]">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--mut)] block mb-2">Applications</span>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <MiniMetric label="Accepted" value={jobApplications.filter(a => a.status === 'accepted').length} />
                  <MiniMetric label="Rejected" value={jobApplications.filter(a => a.status === 'rejected').length} />
                  <MiniMetric label="Pending" value={jobApplications.filter(a => a.status === 'pending').length} />
                </div>
              </div>
              <div className="bg-white/40 rounded-xl p-4 border border-[var(--divider)]">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--mut)] block mb-2">Hire Requests</span>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <MiniMetric label="Accepted" value={jobHireRequests.filter(r => r.status === 'accepted').length} />
                  <MiniMetric label="Pending" value={jobHireRequests.filter(r => r.status === 'pending').length} />
                </div>
              </div>
            </div>
          </div>

          {/* Assigned workers */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--mut)] mb-2">Assigned Workers</h3>
            <div className="rounded-xl border border-[var(--divider)] overflow-hidden">
              {jobWorkers.length === 0 ? (
                <p className="text-xs font-semibold text-[var(--mut)] text-center py-6 bg-white/40">No workers assigned to this job posting yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-white/50">
                      <TableHead className="py-2.5 text-[10px]">Worker</TableHead>
                      <TableHead className="py-2.5 text-[10px]">Skill</TableHead>
                      <TableHead className="py-2.5 text-[10px]">Wage</TableHead>
                      <TableHead className="py-2.5 text-[10px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobWorkers.map(w => (
                      <TableRow
                        key={w.id}
                        onClick={() => setSelectedWorker({
                          id: w.id,
                          full_name: w.labourers?.full_name || '—',
                          skill: w.labourers?.skill_1 || '—',
                          wage: w.labourers?.daily_wage,
                          status: w.status,
                        })}
                        className="cursor-pointer hover:bg-black/5 bg-white/20"
                      >
                        <TableCell className="py-2 font-semibold text-xs text-[var(--ink)]">{w.labourers?.full_name}</TableCell>
                        <TableCell className="py-2 text-xs text-[var(--mut)]">{w.labourers?.skill_1 || '—'}</TableCell>
                        <TableCell className="py-2 font-semibold text-xs text-[var(--ink)]">{fmtMoney(w.labourers?.daily_wage)}</TableCell>
                        <TableCell className="py-2">
                          <Badge className="text-[10px] capitalize font-bold">{w.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>

          {/* Activity Log */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--mut)] mb-2.5">Activity Log</h3>
            <div className="flex flex-col gap-2.5 bg-white/40 rounded-xl p-4 border border-[var(--divider)]">
              <LogItem date={fmtDate(job.created_at)} text="Job posted on platform" />
              {job.escrow_status === 'funded' && (
                <LogItem date={fmtDate(job.created_at)} text="Escrow payments funded successfully" />
              )}
              {jobWorkers.length > 0 && (
                <LogItem date={fmtDate(jobWorkers[0].created_at)} text={`${jobWorkers.length} Workers Joined & assigned`} />
              )}
            </div>
          </div>

          {/* Admin actions */}
          <div className="border-t border-[var(--divider)] pt-5 mt-2 flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-[var(--mut)]">Admin Controls:</span>
            <div className="flex items-center gap-2">
              {job.status === 'hiring' && (
                <Button size="sm" variant="destructive" onClick={() => setConfirmAction({ type: 'close' })} className="gap-1.5 h-8 text-xs font-bold">
                  <XCircle size={13} /> Close Hiring (Fraudulent)
                </Button>
              )}
              {job.status === 'ongoing' && (
                <>
                  <Button size="sm" variant="outline" onClick={() => setConfirmAction({ type: 'pause' })} className="gap-1.5 h-8 text-xs font-bold border-[var(--input-border)] text-[var(--mut)]">
                    <Pause size={13} /> Pause Job
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => setConfirmAction({ type: 'cancel' })} className="gap-1.5 h-8 text-xs font-bold">
                    <XCircle size={13} /> Cancel Job
                  </Button>
                </>
              )}
              {job.status === 'completed' && (
                <span className="text-xs font-bold text-[var(--green)]">✓ Posting Completed & Settlement Finalized</span>
              )}
            </div>
          </div>

        </div>
      )}

      {/* Worker profile dialog */}
      <Dialog open={!!selectedWorker} onOpenChange={(open) => !open && setSelectedWorker(null)}>
        <DialogContent className="sm:max-w-md">
          {selectedWorker && workerDetail && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedWorker.full_name}</DialogTitle>
                <DialogDescription>{selectedWorker.skill} · Payout status: {selectedWorker.status}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4 py-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl bg-white/40 border border-[var(--divider)] p-3">
                    <span className="text-[10px] font-bold uppercase text-[var(--mut)] block mb-1">Experience Level</span>
                    <span className="text-xs font-semibold text-[var(--ink)] capitalize">{workerDetail.workerAssigned?.labourers?.experience_level || 'General'}</span>
                  </div>
                  <div className="rounded-xl bg-white/40 border border-[var(--divider)] p-3">
                    <span className="text-[10px] font-bold uppercase text-[var(--mut)] block mb-1">Daily Wage Rate</span>
                    <span className="text-xs font-semibold text-[var(--ink)]">{fmtMoney(selectedWorker.wage)}</span>
                  </div>
                </div>
                <div className="rounded-xl glass border border-[var(--divider)] p-4">
                  <span className="text-xs font-black uppercase tracking-wider text-[var(--mut)] block mb-2">Attendance Summary</span>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-emerald-50 rounded-lg p-2 border border-emerald-100">
                      <span className="text-xs font-bold text-emerald-700 block">{workerDetail.attendanceSummary.present}</span>
                      <span className="text-[9px] font-bold text-emerald-500 uppercase">Present</span>
                    </div>
                    <div className="bg-red-50 rounded-lg p-2 border border-red-100">
                      <span className="text-xs font-bold text-red-700 block">{workerDetail.attendanceSummary.absent}</span>
                      <span className="text-[9px] font-bold text-red-500 uppercase">Absent</span>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-2 border border-amber-100">
                      <span className="text-xs font-bold text-amber-700 block">{workerDetail.attendanceSummary.halfDay}</span>
                      <span className="text-[9px] font-bold text-amber-500 uppercase">Half Day</span>
                    </div>
                  </div>
                </div>
                <Button
                  onClick={() => { setWorkerAttendanceList(workerDetail.history); setWorkerAttendanceOpen(true); }}
                  className="rounded-xl font-bold h-9 text-xs"
                  style={{ background: 'var(--grad)', color: '#fff' }}
                >
                  View Attendance History
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Attendance history dialog */}
      <Dialog open={workerAttendanceOpen} onOpenChange={setWorkerAttendanceOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Attendance Logs</DialogTitle>
            <DialogDescription>Daily attendance ledger records</DialogDescription>
          </DialogHeader>
          <div className="max-h-[300px] overflow-y-auto pr-1 flex flex-col gap-2 py-2">
            {workerAttendanceList.length === 0 ? (
              <p className="text-xs font-semibold text-center text-[var(--mut)] py-10">No attendance registered yet.</p>
            ) : (
              workerAttendanceList.map(a => (
                <div key={a.id} className="flex items-center justify-between border-b border-[var(--divider)] pb-2">
                  <span className="text-xs font-semibold text-[var(--ink)]">{fmtDate(a.attendance_date)}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] font-extrabold uppercase',
                      a.status === 'present' && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                      a.status === 'absent' && 'bg-red-50 text-red-700 border-red-200',
                      a.status === 'half_day' && 'bg-amber-50 text-amber-700 border-amber-200',
                    )}
                  >
                    {a.status}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm admin action dialog */}
      <Dialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[var(--accent)]">
              <AlertTriangle size={18} /> Confirm Admin Operation
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to perform this update? This action will directly change the live job posting status.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={acting} onClick={() => setConfirmAction(null)}>Cancel</Button>
            <Button variant="destructive" disabled={acting} onClick={handleAdminAction} className="gap-1.5">
              {acting ? <Loader2 size={14} className="animate-spin" /> : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div>
      <h3 className="text-xs font-black uppercase tracking-wider text-[var(--mut)] mb-2.5 flex items-center gap-2">
        <Icon size={12} /> {title}
      </h3>
      <div className="grid grid-cols-2 gap-4 bg-white/40 rounded-xl p-4 border border-[var(--divider)]">
        {children}
      </div>
    </div>
  );
}

function TimelineNode({ label, checked }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={cn('w-4 h-4 rounded-full border-2 flex items-center justify-center', checked ? 'border-[#16B364] bg-[#16B364]' : 'border-gray-300 bg-white')}>
        {checked && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
      </div>
      <span className="whitespace-nowrap">{label}</span>
    </div>
  );
}

function InfoPair({ label, value }) {
  return (
    <div>
      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--mut)] block mb-0.5">{label}</span>
      <span className="text-xs font-semibold text-[var(--ink)] leading-snug">{value ?? '—'}</span>
    </div>
  );
}

function FacilityBadge({ label, active }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'font-bold text-[10px] gap-1 px-2.5 py-1',
        active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-400 border-gray-200 line-through',
      )}
    >
      {active ? '✓' : '✗'} {label}
    </Badge>
  );
}

function MiniMetric({ label, value }) {
  return (
    <div className="bg-white/40 border border-[var(--divider)] rounded-lg p-1.5">
      <span className="text-sm font-black text-[var(--ink)] block leading-none">{value}</span>
      <span className="text-[8px] font-bold text-[var(--mut)] uppercase mt-0.5 block">{label}</span>
    </div>
  );
}

function LogItem({ date, text }) {
  return (
    <div className="flex gap-2">
      <span className="text-[10px] font-bold text-[var(--mut)] w-14 shrink-0">{date}</span>
      <span className="text-xs font-semibold text-[var(--ink)]">{text}</span>
    </div>
  );
}
