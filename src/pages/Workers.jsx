import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { logActivity } from '../lib/activityLog';
import { queryKeys } from '../lib/queryKeys';
import { useSignedUrlMap } from '../lib/storage';
import { CheckCircle, XCircle, Eye, Loader2, RefreshCw, X, AlertTriangle } from 'lucide-react';

const STATUS_BADGE = {
  pending:  'badge badge-orange',
  approved: 'badge badge-green',
  rejected: 'badge badge-red',
};

const FILTERS = ['pending', 'approved', 'rejected'];

export default function Workers() {
  const queryClient = useQueryClient();
  const [filter,    setFilter]    = useState('pending');
  const [preview,   setPreview]   = useState(null);   // worker row for photo modal
  const [rejectRow, setRejectRow] = useState(null);   // worker row for rejection modal
  const [reason,    setReason]    = useState('');
  const [removingIds, setRemovingIds] = useState(() => new Set()); // ids mid fade-out animation
  const [toast,     setToast]     = useState(null);   // { type: 'success' | 'error', message }

  const removalTimeouts = useRef({});
  const toastTimeout = useRef(null);

  useEffect(() => () => {
    Object.values(removalTimeouts.current).forEach(clearTimeout);
    clearTimeout(toastTimeout.current);
  }, []);

  const showToast = useCallback((type, message) => {
    clearTimeout(toastTimeout.current);
    setToast({ type, message });
    toastTimeout.current = setTimeout(() => setToast(null), 4500);
  }, []);

  const queryKey = queryKeys.workersByStatus(filter);
  const { data: workers = [], isLoading: loading, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase
        .from('labourers')
        .select('id, labour_id, full_name, mobile_no, date_of_birth, gender, skill_1, skill_2, skill_3, experience_level, daily_wage, photo_url, government_id_url, status, rejection_reason, created_at')
        .order('created_at', { ascending: false });
      if (filter !== 'all') q = q.eq('status', filter);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  // The bucket is private: these columns hold storage paths, not URLs. One
  // signed URL per distinct path, shared by the table cells and the modal.
  const signedUrls = useSignedUrlMap(
    workers.flatMap(w => [w.photo_url, w.government_id_url]),
  );

  // Optimistically fade the row out and drop it from the cached query data,
  // then sync the DB in the background. If the DB call fails, restore the
  // row and swap the success card for an error card — the user never waits
  // on a full table reload either way.
  const removeRowOptimistically = (id) => {
    setRemovingIds(prev => new Set(prev).add(id));
    removalTimeouts.current[id] = setTimeout(() => {
      queryClient.setQueryData(queryKey, (prev = []) => prev.filter(w => w.id !== id));
      setRemovingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }, 260);
  };

  const restoreRow = (worker) => {
    clearTimeout(removalTimeouts.current[worker.id]);
    setRemovingIds(prev => { const n = new Set(prev); n.delete(worker.id); return n; });
    queryClient.setQueryData(queryKey, (prev = []) => prev.some(w => w.id === worker.id) ? prev : [worker, ...prev]);
  };

  const approve = async (worker) => {
    removeRowOptimistically(worker.id);
    showToast('success', `${worker.full_name} approved`);

    const { error } = await supabase.functions.invoke('approve-labourer', {
      body: { labourer_id: worker.id },
    });

    if (error) {
      console.error('[approve]', error.message);
      restoreRow(worker);
      showToast('error', `Couldn't approve ${worker.full_name} — ${error.message}`);
    } else {
      logActivity('worker_approved', { entityType: 'labourer', entityId: worker.labour_id ?? worker.id, description: `Approved worker ${worker.full_name}` });
      queryClient.invalidateQueries({ queryKey: queryKeys.workersApproved });
      queryClient.invalidateQueries({ queryKey: queryKeys.worker(worker.id) });
    }
  };

  const openReject = (worker) => { setRejectRow(worker); setReason(''); };

  const confirmReject = async () => {
    if (!rejectRow) return;
    const worker = rejectRow;
    setRejectRow(null);
    removeRowOptimistically(worker.id);
    showToast('success', `${worker.full_name} rejected`);

    const { error } = await supabase.from('labourers').update({ status: 'rejected', rejection_reason: reason || null }).eq('id', worker.id);

    if (error) {
      console.error('[reject]', error.message);
      restoreRow(worker);
      showToast('error', `Couldn't reject ${worker.full_name} — ${error.message}`);
    } else {
      logActivity('worker_rejected', { entityType: 'labourer', entityId: worker.labour_id ?? worker.id, description: `Rejected worker ${worker.full_name}${reason ? ` — ${reason}` : ''}` });
      queryClient.invalidateQueries({ queryKey: queryKeys.workersApproved });
      queryClient.invalidateQueries({ queryKey: queryKeys.worker(worker.id) });
    }
  };

  const skills = (w) => [w.skill_1, w.skill_2, w.skill_3].filter(Boolean).join(', ');

  const fmt = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

  return (
    <div className="flex flex-col gap-6">

      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-black text-3xl tracking-tight text-[var(--ink)]">Workers</h1>
          <p className="text-sm text-[var(--mut)] font-semibold mt-1">Review and verify labourer registrations</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl glass text-sm font-semibold text-[var(--mut)] hover:text-[var(--ink)] transition-colors cursor-pointer"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer transition-all ${
              filter === f
                ? 'text-white shadow-sm'
                : 'glass text-[var(--mut)] hover:text-[var(--ink)]'
            }`}
            style={filter === f ? { background: 'var(--grad)' } : {}}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-[var(--mut)]">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm font-semibold">Loading workers…</span>
          </div>
        ) : workers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <p className="text-[var(--mut)] font-semibold text-sm">No {filter === 'all' ? '' : filter} workers found.</p>
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
                  <th>Registered</th>
                  <th>Status</th>
                  <th>Docs</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {workers.map(w => (
                  <tr
                    key={w.id}
                    className="transition-all duration-[260ms] ease-out"
                    style={removingIds.has(w.id)
                      ? { opacity: 0, transform: 'scale(0.98) translateX(6px)' }
                      : { opacity: 1, transform: 'none' }
                    }
                  >
                    {/* Name + avatar */}
                    <td>
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 bg-slate-100 border border-[var(--divider)] cursor-pointer"
                          onClick={() => w.photo_url && setPreview(w)}
                          title="View photo"
                        >
                          {signedUrls[w.photo_url]
                            ? <img src={signedUrls[w.photo_url]} className="w-full h-full object-cover" alt={w.full_name} />
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
                    <td className="text-[var(--mut)] text-xs">{fmt(w.created_at)}</td>
                    <td>
                      <span className={STATUS_BADGE[w.status] ?? 'badge badge-gray'}>
                        {w.status}
                      </span>
                      {w.status === 'rejected' && w.rejection_reason && (
                        <p className="text-[10px] text-[#C91D5E] mt-1 max-w-[120px] truncate" title={w.rejection_reason}>
                          {w.rejection_reason}
                        </p>
                      )}
                    </td>

                    {/* Govt ID link */}
                    <td>
                      {signedUrls[w.government_id_url]
                        ? <a href={signedUrls[w.government_id_url]} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-bold text-[var(--rani)] hover:underline">
                            <Eye size={12} /> View ID
                          </a>
                        : <span className="text-xs text-[var(--mut)]">—</span>
                      }
                    </td>

                    {/* Approve / Reject */}
                    <td>
                      <div className="flex items-center gap-2">
                        {w.status !== 'approved' && (
                          <button
                            onClick={() => approve(w)}
                            disabled={removingIds.has(w.id)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#E4F7EC] text-[#16B364] text-xs font-bold hover:bg-[#c8f0d8] transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle size={12} strokeWidth={2.5} />
                            Approve
                          </button>
                        )}
                        {w.status !== 'rejected' && (
                          <button
                            onClick={() => openReject(w)}
                            disabled={removingIds.has(w.id)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[rgba(201,29,94,0.08)] text-[#C91D5E] text-xs font-bold hover:bg-[rgba(201,29,94,0.15)] transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <XCircle size={12} strokeWidth={2.5} />
                            Reject
                          </button>
                        )}
                      </div>
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
            <img src={signedUrls[preview.photo_url]} alt={preview.full_name}
              className="w-48 h-48 rounded-2xl object-cover border border-[var(--divider)]" />
            <p className="font-display font-bold text-lg text-[var(--ink)]">{preview.full_name}</p>
            <p className="text-sm text-[var(--mut)] font-semibold">{preview.mobile_no}</p>
          </div>
        </Modal>
      )}

      {/* Reject reason modal */}
      {rejectRow && (
        <Modal onClose={() => setRejectRow(null)}>
          <div className="flex flex-col gap-4 w-full">
            <h3 className="font-display font-bold text-lg text-[var(--ink)]">Reject — {rejectRow.full_name}</h3>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--mut)]">Reason (optional)</label>
              <textarea
                rows={3}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Blurry ID document, incomplete details…"
                className="w-full rounded-xl border border-[var(--divider)] bg-white/80 px-3 py-2 text-sm font-medium text-[var(--ink)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--rani)]"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setRejectRow(null)}
                className="px-4 py-2 rounded-xl glass text-sm font-semibold text-[var(--mut)] cursor-pointer">
                Cancel
              </button>
              <button onClick={confirmReject}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[rgba(201,29,94,0.9)] text-white text-sm font-bold cursor-pointer hover:opacity-90 transition-opacity">
                Confirm Reject
              </button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}

function Toast({ toast, onClose }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!toast) { setMounted(false); return; }
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [toast]);

  if (!toast) return null;

  const isError = toast.type === 'error';

  return (
    <div
      className="fixed top-6 left-1/2 z-[100] flex items-center gap-3 rounded-2xl px-4 py-3 glass-card shadow-lg transition-all duration-200 ease-out max-w-md"
      style={{
        transform: `translateX(-50%) translateY(${mounted ? '0' : '-12px'})`,
        opacity: mounted ? 1 : 0,
      }}
    >
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: isError ? 'rgba(201,29,94,0.12)' : 'var(--green-soft)' }}
      >
        {isError
          ? <AlertTriangle size={15} className="text-[#C91D5E]" />
          : <CheckCircle size={15} className="text-[#16B364]" />
        }
      </div>
      <p className="text-sm font-semibold text-[var(--ink)] leading-snug">{toast.message}</p>
      <button onClick={onClose} className="text-[var(--mut)] hover:text-[var(--ink)] cursor-pointer flex-shrink-0">
        <X size={14} />
      </button>
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
