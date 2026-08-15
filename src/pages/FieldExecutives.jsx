import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { logActivity } from '../lib/activityLog';
import { queryKeys } from '../lib/queryKeys';
import {
  Users, Loader2, RefreshCw, Plus,
  CheckCircle2, XCircle, ShieldCheck
} from 'lucide-react';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const STATUS_COLORS = {
  pending:  'bg-amber-100 text-amber-800 border-amber-200',
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
};

const th = 'h-auto py-3 px-4 text-[11px] font-extrabold uppercase tracking-wider text-[var(--mut)]';
const td = 'px-4 py-3.5 text-[var(--mut)] text-xs font-semibold';
const tdStrong = 'px-4 py-3.5 font-semibold text-[var(--ink)] text-sm';

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtTimeAgo = (iso) => {
  if (!iso) return 'Never';
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return 'Just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

export default function FieldExecutives({ userRole }) {
  const [acting, setActing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('approved');

  const { data: executives = [], isLoading: loading, refetch } = useQuery({
    queryKey: queryKeys.fieldExecutives,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('field_executives')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const kpis = useMemo(() => {
    const total = executives.length;
    const approved = executives.filter(e => e.status === 'approved').length;
    const pending = executives.filter(e => e.status === 'pending').length;
    const rejected = executives.filter(e => e.status === 'rejected').length;
    return { total, approved, pending, rejected };
  }, [executives]);

  const openAdd = () => {
    setFullName('');
    setEmail('');
    setPhone('');
    setPassword('');
    setStatus('approved');
    setAddOpen(true);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!fullName || !email || !password) {
      alert('Please provide name, email and password.');
      return;
    }
    if (password.length < 8) {
      alert('Password must be at least 8 characters.');
      return;
    }
    setActing(true);

    // 1. Create the Auth user via Edge Function (needs service role).
    const { data: fnData, error: fnError } = await supabase.functions.invoke('create-field-executive', {
      body: { email, password, full_name: fullName },
    });

    if (fnError || !fnData?.success) {
      const detail = fnData?.error || fnError?.message || 'Unknown error';
      alert('Failed to create field executive: ' + detail);
      console.error('[create-field-executive]', { error: fnError, data: fnData });
      setActing(false);
      return;
    }

    // 2. Insert the field_executives row directly (RLS allows admins via is_admin()).
    const { error: insertError } = await supabase.from('field_executives').insert({
      id: fnData.id,
      email,
      full_name: fullName,
      phone: phone || null,
      status,
    });

    if (insertError) {
      alert('Auth user created, but failed to save field executive record: ' + insertError.message);
      console.error('[field_executives insert]', insertError);
      setActing(false);
      return;
    }

    logActivity('field_executive_created', {
      entityType: 'field_executive',
      entityId: email,
      description: `Created field executive ${fullName} (${email}) with status ${status}`,
    });
    setAddOpen(false);
    refetch();
    setActing(false);
  };

  const updateStatus = async (exec, nextStatus) => {
    setActing(true);
    const { error } = await supabase
      .from('field_executives')
      .update({ status: nextStatus })
      .eq('id', exec.id);

    if (error) {
      alert('Failed to update status: ' + error.message);
    } else {
      logActivity(`field_executive_${nextStatus}`, {
        entityType: 'field_executive',
        entityId: exec.email,
        description: `Marked field executive ${exec.full_name} as ${nextStatus}`,
      });
      refetch();
    }
    setActing(false);
  };

  return (
    <div className="flex flex-col gap-8 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-black text-3xl tracking-tight text-[var(--ink)]">Field Executives</h1>
          <p className="text-sm text-[var(--mut)] font-semibold mt-1">Create and manage field executives who onboard labourers.</p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={() => refetch()}
            className="glass rounded-xl px-4 py-2 h-auto gap-2 text-sm font-semibold text-[var(--mut)] hover:text-[var(--ink)]"
          >
            <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
            Refresh
          </Button>

          <Button
            onClick={openAdd}
            className="gap-2 rounded-xl px-4 py-2 h-auto text-sm font-semibold border-transparent"
            style={{ background: 'var(--grad)', color: '#fff' }}
          >
            <Plus size={14} /> Add Field Executive
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPIItem label="Total" value={kpis.total} color="#7A3BFF" icon={Users} />
        <KPIItem label="Approved" value={kpis.approved} color="#16B364" icon={CheckCircle2} />
        <KPIItem label="Pending" value={kpis.pending} color="#FF8A1E" icon={ShieldCheck} />
        <KPIItem label="Rejected" value={kpis.rejected} color="#C91D5E" icon={XCircle} />
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-[var(--mut)]">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm font-semibold">Loading field executives…</span>
          </div>
        ) : executives.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <p className="text-[var(--mut)] font-semibold text-sm">No field executives found.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--divider)] hover:bg-transparent">
                <TableHead className={th}>Name</TableHead>
                <TableHead className={th}>Email</TableHead>
                <TableHead className={th}>Phone</TableHead>
                <TableHead className={th}>Status</TableHead>
                <TableHead className={th}>Created</TableHead>
                <TableHead className={th}>Last Login</TableHead>
                <TableHead className={th}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {executives.map(exec => (
                <TableRow key={exec.id} className="border-[var(--divider)] hover:bg-black/[0.015]">
                  <TableCell className={tdStrong}>{exec.full_name}</TableCell>
                  <TableCell className={td}>{exec.email}</TableCell>
                  <TableCell className={td}>{exec.phone || '—'}</TableCell>
                  <TableCell className={td}>
                    <Badge variant="outline" className={cn('text-[10px] font-bold uppercase py-0.5', STATUS_COLORS[exec.status] ?? 'bg-gray-100')}>
                      {exec.status}
                    </Badge>
                  </TableCell>
                  <TableCell className={td}>{fmtDate(exec.created_at)}</TableCell>
                  <TableCell className={td}>{fmtTimeAgo(exec.last_login)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {exec.status !== 'approved' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 rounded-lg text-emerald-600 hover:text-emerald-700"
                          onClick={() => updateStatus(exec, 'approved')}
                          disabled={acting}
                        >
                          <CheckCircle2 size={15} />
                        </Button>
                      )}
                      {exec.status !== 'rejected' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 rounded-lg text-red-500 hover:text-red-700"
                          onClick={() => updateStatus(exec, 'rejected')}
                          disabled={acting}
                        >
                          <XCircle size={15} />
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

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto bg-white text-[var(--ink)] border border-[var(--divider)] shadow-xl">
          <DialogHeader>
            <DialogTitle>Add Field Executive</DialogTitle>
            <DialogDescription>Create an account that can log in to /onboarding and register labourers.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--mut)]">Full Name</label>
              <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="e.g. Rahul Sharma" required className="h-9 text-xs" />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--mut)]">Email Address</label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="e.g. rahul@shramik.in" required className="h-9 text-xs" />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--mut)]">Phone</label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. +91 98765 43210" className="h-9 text-xs" />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--mut)]">Password</label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters" required minLength={8} className="h-9 text-xs" />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--mut)]">Initial Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="h-9 rounded-xl glass border-0 px-3 text-xs font-bold uppercase tracking-wider text-[var(--mut)] outline-none cursor-pointer"
              >
                <option value="approved">Approved</option>
                <option value="pending">Pending</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={acting} style={{ background: 'var(--grad)', color: '#fff' }} className="gap-1.5 font-bold">
                {acting ? <Loader2 size={14} className="animate-spin" /> : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KPIItem({ label, value, icon: Icon, color }) {
  return (
    <div className="stat-card glass p-6" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
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
