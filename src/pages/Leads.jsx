import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { logActivity } from '../lib/activityLog';
import { queryKeys } from '../lib/queryKeys';
import {
  Phone,
  User,
  Loader2,
  RefreshCw,
  Plus,
  CheckCircle2,
  Circle,
  Filter,
} from 'lucide-react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'uncontacted', label: 'Uncontacted' },
  { id: 'contacted', label: 'Contacted' },
];

const STATUS_COLORS = {
  uncontacted: 'bg-amber-100 text-amber-800 border-amber-200',
  contacted: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};

const th = 'h-auto py-3 px-4 text-[11px] font-extrabold uppercase tracking-wider text-[var(--mut)]';
const td = 'px-4 py-3.5 text-[var(--mut)] text-xs font-semibold';
const tdStrong = 'px-4 py-3.5 font-semibold text-[var(--ink)] text-sm';

const fmtDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

export default function Leads() {
  const [activeTab, setActiveTab] = useState('all');
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');

  const { data: leads = [], isLoading, refetch } = useQuery({
    queryKey: queryKeys.leads,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredLeads = useMemo(() => {
    if (activeTab === 'all') return leads;
    return leads.filter((l) => l.status === activeTab);
  }, [leads, activeTab]);

  const kpis = useMemo(() => {
    const total = leads.length;
    const uncontacted = leads.filter((l) => l.status === 'uncontacted').length;
    const contacted = leads.filter((l) => l.status === 'contacted').length;
    return { total, uncontacted, contacted };
  }, [leads]);

  const openAdd = () => {
    setName('');
    setPhone('');
    setError('');
    setAddOpen(true);
  };

  const validate = () => {
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedName && !trimmedPhone) {
      return 'Please enter a name or a phone number.';
    }
    if (trimmedPhone && !/^\d{10}$/.test(trimmedPhone.replace(/\D/g, ''))) {
      return 'Please enter a valid 10-digit phone number.';
    }
    return '';
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setActing(true);
    setError('');

    const cleanedPhone = phone.trim() ? phone.replace(/\D/g, '').slice(-10) : null;

    const { error: insertError } = await supabase.from('leads').insert({
      name: name.trim() || null,
      phone: cleanedPhone,
      status: 'uncontacted',
    });

    if (insertError) {
      setError(insertError.message);
      setActing(false);
      return;
    }

    logActivity('lead_created', {
      entityType: 'lead',
      entityId: cleanedPhone || name.trim(),
      description: `Created lead: ${name.trim() || '(no name)'} / ${cleanedPhone || '(no phone)'}`,
    });

    setAddOpen(false);
    refetch();
    setActing(false);
  };

  const toggleStatus = async (lead) => {
    const nextStatus = lead.status === 'uncontacted' ? 'contacted' : 'uncontacted';
    setActing(true);

    const { error: updateError } = await supabase
      .from('leads')
      .update({ status: nextStatus })
      .eq('id', lead.id);

    if (updateError) {
      alert('Failed to update status: ' + updateError.message);
      setActing(false);
      return;
    }

    logActivity(`lead_${nextStatus}`, {
      entityType: 'lead',
      entityId: lead.id,
      description: `Marked lead ${lead.name || lead.phone || lead.id} as ${nextStatus}`,
    });

    refetch();
    setActing(false);
  };

  return (
    <div className="flex flex-col gap-8 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-black text-3xl tracking-tight text-[var(--ink)]">Leads</h1>
          <p className="text-sm text-[var(--mut)] font-semibold mt-1">
            Capture and track sales or support leads.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={() => refetch()}
            className="glass rounded-xl px-4 py-2 h-auto gap-2 text-sm font-semibold text-[var(--mut)] hover:text-[var(--ink)]"
          >
            <RefreshCw size={14} className={cn(isLoading && 'animate-spin')} />
            Refresh
          </Button>

          <Button
            onClick={openAdd}
            className="gap-2 rounded-xl px-4 py-2 h-auto text-sm font-semibold border-transparent"
            style={{ background: 'var(--grad)', color: '#fff' }}
          >
            <Plus size={14} /> Add Lead
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <KPIItem label="Total" value={kpis.total} color="#7A3BFF" icon={Filter} />
        <KPIItem label="Uncontacted" value={kpis.uncontacted} color="#FF8A1E" icon={Circle} />
        <KPIItem label="Contacted" value={kpis.contacted} color="#16B364" icon={CheckCircle2} />
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="border-b border-[var(--divider)] px-4">
          <div className="flex gap-1 py-3">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer',
                  activeTab === tab.id
                    ? 'bg-black/[0.06] text-[var(--ink)]'
                    : 'text-[var(--mut)] hover:text-[var(--ink)] hover:bg-black/[0.03]'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-[var(--mut)]">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm font-semibold">Loading leads…</span>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <p className="text-[var(--mut)] font-semibold text-sm">
              No {activeTab === 'all' ? '' : activeTab} leads found.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-b border-[var(--divider)] hover:bg-transparent">
                <TableHead className={th}>Name</TableHead>
                <TableHead className={th}>Phone</TableHead>
                <TableHead className={th}>Status</TableHead>
                <TableHead className={th}>Created</TableHead>
                <TableHead className={th}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.map((lead) => (
                <TableRow key={lead.id} className="border-b border-[var(--divider)] last:border-0">
                  <TableCell className={tdStrong}>
                    <div className="flex items-center gap-2">
                      <User size={14} className="text-[var(--mut)]" />
                      {lead.name || '—'}
                    </div>
                  </TableCell>
                  <TableCell className={td}>
                    <div className="flex items-center gap-2">
                      <Phone size={14} className="text-[var(--mut)]" />
                      {lead.phone || '—'}
                    </div>
                  </TableCell>
                  <TableCell className={td}>
                    <Badge
                      variant="outline"
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase border',
                        STATUS_COLORS[lead.status]
                      )}
                    >
                      {lead.status}
                    </Badge>
                  </TableCell>
                  <TableCell className={td}>{fmtDate(lead.created_at)}</TableCell>
                  <TableCell className={td}>
                    <Button
                      size="sm"
                      variant={lead.status === 'uncontacted' ? 'default' : 'outline'}
                      onClick={() => toggleStatus(lead)}
                      disabled={acting}
                      className="rounded-lg text-xs font-semibold h-8 cursor-pointer"
                      style={
                        lead.status === 'uncontacted'
                          ? { background: 'var(--grad)', color: '#fff', border: 'none' }
                          : {}
                      }
                    >
                      {lead.status === 'uncontacted' ? 'Mark Contacted' : 'Mark Uncontacted'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md glass-card border-[var(--divider)]">
          <DialogHeader>
            <DialogTitle className="font-display font-black text-xl text-[var(--ink)]">
              Add Lead
            </DialogTitle>
            <DialogDescription className="text-sm text-[var(--mut)] font-semibold">
              Enter a name and/or phone number. At least one field is required.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="flex flex-col gap-4 mt-2">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="lead-name"
                className="text-xs font-bold text-[var(--mut)] uppercase tracking-wider"
              >
                Name
              </label>
              <Input
                id="lead-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rajesh Kumar"
                className="glass-input h-11 rounded-xl"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="lead-phone"
                className="text-xs font-bold text-[var(--mut)] uppercase tracking-wider"
              >
                Phone
              </label>
              <Input
                id="lead-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="10-digit mobile number"
                maxLength={10}
                className="glass-input h-11 rounded-xl"
              />
            </div>

            {error && (
              <p className="text-xs font-semibold text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <DialogFooter className="mt-2 gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAddOpen(false)}
                className="rounded-xl h-11 px-5 text-sm font-semibold"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={acting}
                className="rounded-xl h-11 px-5 text-sm font-semibold border-0"
                style={{ background: 'var(--grad)', color: '#fff' }}
              >
                {acting ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
                Save Lead
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KPIItem({ label, value, color, icon: Icon }) {
  return (
    <div className="glass-card rounded-2xl p-4 flex items-center gap-4">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}15` }}
      >
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--mut)]">
          {label}
        </p>
        <p className="text-2xl font-black text-[var(--ink)] font-display">{value}</p>
      </div>
    </div>
  );
}
