import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { logActivity } from '../lib/activityLog';
import { queryKeys } from '../lib/queryKeys';
import { Loader2, RefreshCw, CheckCircle, XCircle, Landmark } from 'lucide-react';
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'pending',  label: 'Pending',  color: 'var(--saffron)' },
  { id: 'verified', label: 'Verified', color: 'var(--green)'   },
  { id: 'rejected', label: 'Rejected', color: 'var(--accent)'  },
];

const OWNER_FILTERS = [
  { id: 'all',      label: 'All'      },
  { id: 'Labourer', label: 'Labourer' },
  { id: 'Hirer',    label: 'Hirer'    },
];

const OWNER_BADGE = {
  Hirer:    'border-transparent bg-[rgba(122,59,255,0.10)] text-[var(--violet)]',
  Labourer: 'border-transparent bg-[rgba(255,138,30,0.12)] text-[var(--saffron)]',
};

const STATUS_BADGE = {
  pending:  'border-transparent bg-[rgba(255,138,30,0.12)] text-[var(--saffron)]',
  verified: 'border-transparent bg-[var(--green-soft)] text-[var(--green)]',
  rejected: 'border-transparent bg-[rgba(201,29,94,0.10)] text-[var(--accent)]',
};

async function fetchAccounts(table, ownerLabel) {
  const { data, error } = await supabase
    .from(table)
    .select('id, account_holder_name, account_number, ifsc_code, bank_name, branch_name, account_type, upi_id, is_verified, verification_method, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(`[${table}]`, error.message);
    return [];
  }
  return (data ?? []).map(row => ({ ...row, owner: ownerLabel, table }));
}

function statusOf(row) {
  if (row.is_verified) return 'verified';
  if (row.verification_method === 'rejected') return 'rejected';
  return 'pending';
}

const maskAccount = (num) => num ? `••••${String(num).slice(-4)}` : '—';

export default function PaymentsVerification() {
  const queryClient = useQueryClient();
  const [tab,      setTab]      = useState('pending');
  const [owner,    setOwner]    = useState('all');
  const [acting,   setActing]   = useState(null);

  const { data: accounts = [], isLoading: loading, refetch, isFetching } = useQuery({
    queryKey: queryKeys.bankAccountsPending,
    queryFn: async () => {
      const [hirerAccounts, labourerAccounts] = await Promise.all([
        fetchAccounts('hirer_bank_accounts', 'Hirer'),
        fetchAccounts('labourer_bank_accounts', 'Labourer'),
      ]);
      return [...hirerAccounts, ...labourerAccounts]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    },
  });
  const load = () => refetch();

  const accept = async (row) => {
    setActing(row.id);
    await supabase
      .from(row.table)
      .update({ is_verified: true, verification_method: 'manual_admin' })
      .eq('id', row.id);
    logActivity('bank_account_verified', { entityType: row.owner, entityId: row.id, description: `Verified ${row.owner.toLowerCase()} bank account for ${row.account_holder_name}` });
    setActing(null);
    queryClient.invalidateQueries({ queryKey: queryKeys.bankAccountsPending });
  };

  const reject = async (row) => {
    setActing(row.id);
    await supabase
      .from(row.table)
      .update({ is_verified: false, verification_method: 'rejected' })
      .eq('id', row.id);
    logActivity('bank_account_rejected', { entityType: row.owner, entityId: row.id, description: `Rejected ${row.owner.toLowerCase()} bank account for ${row.account_holder_name}` });
    setActing(null);
    queryClient.invalidateQueries({ queryKey: queryKeys.bankAccountsPending });
  };

  const fmt = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

  const rows = accounts.filter(row =>
    statusOf(row) === tab && (owner === 'all' || row.owner === owner)
  );

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-black text-3xl tracking-tight text-[var(--ink)]">Payment Verification</h1>
          <p className="text-sm text-[var(--mut)] font-semibold mt-1">Review and verify bank accounts submitted by workers and hirers</p>
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

      {/* Tabs + owner filter */}
      <Tabs value={tab} onValueChange={setTab} className="flex-col gap-4">
        <div className="flex items-center justify-between">
          <TabsList className="h-auto w-fit gap-2 rounded-xl bg-transparent p-0">
            {TABS.map(t => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                className="h-auto flex-none rounded-xl px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-[var(--mut)] glass data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:border-transparent"
                style={tab === t.id ? { background: t.color } : {}}
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex items-center gap-2 glass rounded-xl p-1">
            {OWNER_FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => setOwner(f.id)}
                className={cn(
                  'px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer',
                  owner === f.id
                    ? 'text-white shadow-md'
                    : 'text-[var(--mut)] hover:text-[var(--ink)]',
                )}
                style={owner === f.id ? { background: 'var(--grad)' } : {}}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {TABS.map(t => (
          <TabsContent key={t.id} value={t.id}>
            <div className="glass-card rounded-2xl overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-20 gap-3 text-[var(--mut)]">
                  <Loader2 size={20} className="animate-spin" />
                  <span className="text-sm font-semibold">Loading accounts…</span>
                </div>
              ) : rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-black/[0.03]">
                    <Landmark size={20} className="text-[var(--mut)]" />
                  </div>
                  <p className="text-[var(--mut)] font-semibold text-sm">No {t.label.toLowerCase()} accounts found.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-[var(--divider)] hover:bg-transparent">
                      <TableHead className="h-auto py-3 px-4 text-[11px] font-extrabold uppercase tracking-wider text-[var(--mut)]">Account Holder</TableHead>
                      <TableHead className="h-auto py-3 px-4 text-[11px] font-extrabold uppercase tracking-wider text-[var(--mut)]">Type</TableHead>
                      <TableHead className="h-auto py-3 px-4 text-[11px] font-extrabold uppercase tracking-wider text-[var(--mut)]">Account No.</TableHead>
                      <TableHead className="h-auto py-3 px-4 text-[11px] font-extrabold uppercase tracking-wider text-[var(--mut)]">IFSC</TableHead>
                      <TableHead className="h-auto py-3 px-4 text-[11px] font-extrabold uppercase tracking-wider text-[var(--mut)]">Bank</TableHead>
                      <TableHead className="h-auto py-3 px-4 text-[11px] font-extrabold uppercase tracking-wider text-[var(--mut)]">UPI ID</TableHead>
                      <TableHead className="h-auto py-3 px-4 text-[11px] font-extrabold uppercase tracking-wider text-[var(--mut)]">Added</TableHead>
                      <TableHead className="h-auto py-3 px-4 text-[11px] font-extrabold uppercase tracking-wider text-[var(--mut)]">Status</TableHead>
                      <TableHead className="h-auto py-3 px-4 text-[11px] font-extrabold uppercase tracking-wider text-[var(--mut)]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(row => {
                      const status = statusOf(row);
                      return (
                        <TableRow key={`${row.table}-${row.id}`} className="border-[var(--divider)] hover:bg-black/[0.018]">
                          <TableCell className="px-4 py-3.5">
                            <div className="flex items-center gap-3">
                              <Avatar className="border border-[var(--divider)]">
                                <AvatarFallback className="bg-slate-100 text-xs font-black text-[var(--mut)]">
                                  {row.account_holder_name?.[0]?.toUpperCase() ?? '?'}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-semibold text-[var(--ink)] text-sm">{row.account_holder_name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3.5">
                            <Badge className={cn('font-bold', OWNER_BADGE[row.owner])}>{row.owner}</Badge>
                          </TableCell>
                          <TableCell className="px-4 py-3.5 text-[var(--mut)] text-xs font-semibold">{maskAccount(row.account_number)}</TableCell>
                          <TableCell className="px-4 py-3.5 text-[var(--mut)] text-xs font-semibold">{row.ifsc_code}</TableCell>
                          <TableCell className="px-4 py-3.5 text-[var(--mut)] text-xs font-semibold">{row.bank_name ?? '—'}</TableCell>
                          <TableCell className="px-4 py-3.5 text-[var(--mut)] text-xs font-semibold">{row.upi_id ?? '—'}</TableCell>
                          <TableCell className="px-4 py-3.5 text-[var(--mut)] text-xs font-semibold">{fmt(row.created_at)}</TableCell>
                          <TableCell className="px-4 py-3.5">
                            <Badge className={cn('font-bold capitalize', STATUS_BADGE[status])}>{status}</Badge>
                          </TableCell>
                          <TableCell className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              {status !== 'verified' && (
                                <Button
                                  size="sm"
                                  disabled={acting === row.id}
                                  onClick={() => accept(row)}
                                  className="gap-1 rounded-lg bg-[var(--green-soft)] text-[var(--green)] hover:bg-[#c8f0d8] shadow-none"
                                >
                                  {acting === row.id
                                    ? <Loader2 size={12} className="animate-spin" />
                                    : <CheckCircle size={12} strokeWidth={2.5} />
                                  }
                                  Accept
                                </Button>
                              )}
                              {status !== 'rejected' && (
                                <Button
                                  size="sm"
                                  disabled={acting === row.id}
                                  onClick={() => reject(row)}
                                  className="gap-1 rounded-lg bg-[rgba(201,29,94,0.08)] text-[var(--accent)] hover:bg-[rgba(201,29,94,0.15)] shadow-none"
                                >
                                  <XCircle size={12} strokeWidth={2.5} />
                                  Reject
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>

    </div>
  );
}
