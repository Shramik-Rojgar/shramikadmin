import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { logActivity } from '../lib/activityLog';
import { queryKeys } from '../lib/queryKeys';
import { CheckCircle, XCircle, Eye, Loader2, RefreshCw, X, Building2, User, AlertTriangle } from 'lucide-react';

const STATUS_BADGE = {
  pending: 'badge badge-orange',
  active:  'badge badge-green',
  blocked: 'badge badge-red',
};

const FILTERS = ['pending', 'active', 'blocked'];

export default function Hirers() {
  const queryClient = useQueryClient();
  const [filter,    setFilter]    = useState('pending');
  const [blockRow,  setBlockRow]  = useState(null);
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

  const queryKey = queryKeys.hirersByStatus(filter);
  const { data: hirers = [], isLoading: loading, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase
        .from('hirers')
        .select('id, hirer_id, first_name, last_name, mobile_no, email, entity_type, company_name, gst_number, city, state, aadhar_url, is_verified, status, rejection_reason, created_at')
        .order('created_at', { ascending: false });
      if (filter !== 'all') q = q.eq('status', filter);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  // Optimistically fade the row out and drop it from the cached query data,
  // then sync the DB in the background. If the DB call fails, restore the
  // row and swap the success card for an error card — the user never waits
  // on a full table reload either way.
  const removeRowOptimistically = (id) => {
    setRemovingIds(prev => new Set(prev).add(id));
    removalTimeouts.current[id] = setTimeout(() => {
      queryClient.setQueryData(queryKey, (prev = []) => prev.filter(h => h.id !== id));
      setRemovingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }, 260);
  };

  const restoreRow = (hirer) => {
    clearTimeout(removalTimeouts.current[hirer.id]);
    setRemovingIds(prev => { const n = new Set(prev); n.delete(hirer.id); return n; });
    queryClient.setQueryData(queryKey, (prev = []) => prev.some(h => h.id === hirer.id) ? prev : [hirer, ...prev]);
  };

  const approve = async (hirer) => {
    removeRowOptimistically(hirer.id);
    showToast('success', `${hirer.first_name} ${hirer.last_name} approved`);

    const { error } = await supabase.functions.invoke('approve-hirer', {
      body: { hirer_id: hirer.id },
    });

    if (error) {
      console.error('[approve-hirer]', error.message);
      restoreRow(hirer);
      showToast('error', `Couldn't approve ${hirer.first_name} ${hirer.last_name} — ${error.message}`);
    } else {
      logActivity('hirer_approved', { entityType: 'hirer', entityId: hirer.hirer_id ?? hirer.id, description: `Approved hirer ${hirer.first_name} ${hirer.last_name}` });
      queryClient.invalidateQueries({ queryKey: queryKeys.hirersActive });
      queryClient.invalidateQueries({ queryKey: queryKeys.hirer(hirer.id) });
    }
  };

  const openBlock = (hirer) => { setBlockRow(hirer); setReason(''); };

  const confirmBlock = async () => {
    if (!blockRow) return;
    const hirer = blockRow;
    setBlockRow(null);
    removeRowOptimistically(hirer.id);
    showToast('success', `${hirer.first_name} ${hirer.last_name} blocked`);

    const { error } = await supabase
      .from('hirers')
      .update({ status: 'blocked', rejection_reason: reason || null })
      .eq('id', hirer.id);

    if (error) {
      console.error('[block]', error.message);
      restoreRow(hirer);
      showToast('error', `Couldn't block ${hirer.first_name} ${hirer.last_name} — ${error.message}`);
    } else {
      logActivity('hirer_blocked', { entityType: 'hirer', entityId: hirer.hirer_id ?? hirer.id, description: `Blocked hirer ${hirer.first_name} ${hirer.last_name}${reason ? ` — ${reason}` : ''}` });
      queryClient.invalidateQueries({ queryKey: queryKeys.hirersActive });
      queryClient.invalidateQueries({ queryKey: queryKeys.hirer(hirer.id) });
    }
  };

  const fmt = (iso) => iso
    ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
    : '—';

  const fullName = (h) => `${h.first_name} ${h.last_name}`;

  return (
    <div className="flex flex-col gap-6">

      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-black text-3xl tracking-tight text-[var(--ink)]">Hirers</h1>
          <p className="text-sm text-[var(--mut)] font-semibold mt-1">Review and verify hirer registrations</p>
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
            <span className="text-sm font-semibold">Loading hirers…</span>
          </div>
        ) : hirers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <p className="text-[var(--mut)] font-semibold text-sm">No {filter} hirers found.</p>
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
                  <th>City</th>
                  <th>Registered</th>
                  <th>Status</th>
                  <th>Aadhaar</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {hirers.map(h => (
                  <tr
                    key={h.id}
                    className="transition-all duration-[260ms] ease-out"
                    style={removingIds.has(h.id)
                      ? { opacity: 0, transform: 'scale(0.98) translateX(6px)' }
                      : { opacity: 1, transform: 'none' }
                    }
                  >
                    {/* Name */}
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
                    <td className="text-[var(--mut)] text-xs max-w-[140px] truncate">
                      {h.company_name ?? '—'}
                    </td>
                    <td className="text-[var(--mut)] text-xs">{h.city ?? '—'}</td>
                    <td className="text-[var(--mut)] text-xs">{fmt(h.created_at)}</td>
                    <td>
                      <span className={STATUS_BADGE[h.status] ?? 'badge badge-gray'}>
                        {h.status}
                      </span>
                      {h.status === 'blocked' && h.rejection_reason && (
                        <p className="text-[10px] text-[#C91D5E] mt-1 max-w-[120px] truncate" title={h.rejection_reason}>
                          {h.rejection_reason}
                        </p>
                      )}
                    </td>
                    {/* Aadhaar link — only for Individual */}
                    <td>
                      {h.aadhar_url
                        ? <a href={h.aadhar_url} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-bold text-[var(--rani)] hover:underline">
                            <Eye size={12} /> View
                          </a>
                        : <span className="text-xs text-[var(--mut)]">—</span>
                      }
                    </td>
                    {/* Actions */}
                    <td>
                      <div className="flex items-center gap-2">
                        {h.status !== 'active' && (
                          <button
                            onClick={() => approve(h)}
                            disabled={removingIds.has(h.id)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#E4F7EC] text-[#16B364] text-xs font-bold hover:bg-[#c8f0d8] transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle size={12} strokeWidth={2.5} />
                            Approve
                          </button>
                        )}
                        {h.status !== 'blocked' && (
                          <button
                            onClick={() => openBlock(h)}
                            disabled={removingIds.has(h.id)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[rgba(201,29,94,0.08)] text-[#C91D5E] text-xs font-bold hover:bg-[rgba(201,29,94,0.15)] transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <XCircle size={12} strokeWidth={2.5} />
                            Block
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

      {/* Block reason modal */}
      {blockRow && (
        <Modal onClose={() => setBlockRow(null)}>
          <div className="flex flex-col gap-4 w-full">
            <h3 className="font-display font-bold text-lg text-[var(--ink)]">Block — {fullName(blockRow)}</h3>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--mut)]">Reason (optional)</label>
              <textarea
                rows={3}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Suspicious activity, duplicate account…"
                className="w-full rounded-xl border border-[var(--divider)] bg-white/80 px-3 py-2 text-sm font-medium text-[var(--ink)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--rani)]"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setBlockRow(null)}
                className="px-4 py-2 rounded-xl glass text-sm font-semibold text-[var(--mut)] cursor-pointer">
                Cancel
              </button>
              <button onClick={confirmBlock}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[rgba(201,29,94,0.9)] text-white text-sm font-bold cursor-pointer hover:opacity-90 transition-opacity">
                Confirm Block
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
