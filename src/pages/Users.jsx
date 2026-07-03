import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  Users, User, Mail, Phone, ShieldCheck, Key, ShieldAlert,
  Loader2, RefreshCw, Plus, Edit3, Trash2, Eye, ToggleLeft, ToggleRight, CheckCircle2, XCircle
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

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  finance_admin: 'Finance Admin',
  verification_officer: 'Verification Officer'
};

const ROLE_COLORS = {
  super_admin: 'bg-purple-100 text-purple-800 border-purple-200',
  admin: 'bg-blue-100 text-blue-800 border-blue-200',
  finance_admin: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  verification_officer: 'bg-amber-100 text-amber-800 border-amber-200'
};

const th = 'h-auto py-3 px-4 text-[11px] font-extrabold uppercase tracking-wider text-[var(--mut)]';
const td = 'px-4 py-3.5 text-[var(--mut)] text-xs font-semibold';
const tdStrong = 'px-4 py-3.5 font-semibold text-[var(--ink)] text-sm';

const fmtDate  = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
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

export default function UsersPage({ userRole }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  // Dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [viewUser, setViewUser] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Form fields
  const [authUid, setAuthUid] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('admin');
  const [isActive, setIsActive] = useState(true);

  // Load all users
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('admin_users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[admin_users]', error.message);
    } else {
      setUsers(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Aggregate staff KPI values
  const kpis = useMemo(() => {
    const total = users.length;
    const active = users.filter(u => u.is_active).length;
    const inactive = total - active;
    const superAdmins = users.filter(u => u.role === 'super_admin').length;
    return { total, active, inactive, superAdmins };
  }, [users]);

  // Create user submit
  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!fullName || !email) {
      alert('Please provide Name and Email');
      return;
    }
    setActing(true);

    // Call Supabase Edge Function to handle:
    // 1. Create auth.users account using Admin API
    // 2. Receive auth_user_id
    // 3. Insert into admin_users
    // 4. Send password setup / invite email
    const { data, error } = await supabase.functions.invoke('create-admin-user', {
      body: { email, full_name: fullName, role, phone, is_active: isActive }
    });

    if (error) {
      console.warn('[invite-error, trying local fallback]', error.message);
      // Fallback: local direct insert for demo/development environments where functions aren't deployed
      const generatedId = crypto.randomUUID();
      const { error: insertErr } = await supabase
        .from('admin_users')
        .insert({
          id: generatedId,
          email,
          full_name: fullName,
          role,
          phone,
          is_active: isActive,
          created_at: new Date().toISOString()
        });

      if (insertErr) {
        alert('Edge function error: ' + error.message + '\nFallback insert error: ' + insertErr.message);
      } else {
        alert('Admin user created locally (Local Fallback Mode).');
        setAddOpen(false);
        load();
      }
    } else {
      alert('Admin user account created and password setup email sent!');
      setAddOpen(false);
      load();
    }
    setActing(false);
  };

  // Edit user submit
  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editUser) return;
    setActing(true);

    const { error } = await supabase
      .from('admin_users')
      .update({
        full_name: fullName,
        role,
        phone,
        is_active: isActive
      })
      .eq('id', editUser.id);

    if (error) {
      alert('Failed to update admin user: ' + error.message);
    } else {
      setEditUser(null);
      load();
    }
    setActing(false);
  };

  // Toggle active / inactive status directly
  const handleToggleActive = async (user) => {
    const nextActive = !user.is_active;
    const { error } = await supabase
      .from('admin_users')
      .update({ is_active: nextActive })
      .eq('id', user.id);

    if (error) {
      alert('Error updating status: ' + error.message);
    } else {
      load();
    }
  };

  // Reset password handler
  const handleResetPassword = async (user) => {
    const { error } = await supabase.auth.resetPasswordForEmail(user.email);
    if (error) {
      alert('Failed to send password reset: ' + error.message);
    } else {
      alert(`Password reset link sent successfully to ${user.email}`);
    }
  };

  // Delete user handler
  const handleDeleteUser = async () => {
    if (!confirmDelete) return;
    setActing(true);

    const { error } = await supabase
      .from('admin_users')
      .delete()
      .eq('id', confirmDelete.id);

    if (error) {
      alert('Error deleting user: ' + error.message);
    } else {
      setConfirmDelete(null);
      load();
    }
    setActing(false);
  };

  // Open add dialog and clear inputs
  const openAdd = () => {
    setAuthUid('');
    setFullName('');
    setEmail('');
    setPhone('');
    setRole('admin');
    setIsActive(true);
    setAddOpen(true);
  };

  // Open edit dialog and fill inputs
  const openEdit = (user) => {
    setEditUser(user);
    setFullName(user.full_name);
    setEmail(user.email);
    setPhone(user.phone || '');
    setRole(user.role);
    setIsActive(user.is_active);
  };

  return (
    <div className="flex flex-col gap-8 pb-10">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-black text-3xl tracking-tight text-[var(--ink)]">Admin Staff Management</h1>
          <p className="text-sm text-[var(--mut)] font-semibold mt-1">Configure system staff members, permissions, and roles</p>
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

          {userRole === 'super_admin' && (
            <Button
              onClick={openAdd}
              className="gap-2 rounded-xl px-4 py-2 h-auto text-sm font-semibold border-transparent"
              style={{ background: 'var(--grad)', color: '#fff' }}
            >
              <Plus size={14} /> Add User
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPIItem label="Total Staff" value={kpis.total} color="#7A3BFF" icon={Users} />
        <KPIItem label="Active Users" value={kpis.active} color="#16B364" icon={CheckCircle2} />
        <KPIItem label="Inactive Users" value={kpis.inactive} color="#C91D5E" icon={XCircle} />
        <KPIItem label="Super Admins" value={kpis.superAdmins} color="#FF8A1E" icon={ShieldCheck} />
      </div>

      {/* Main Table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-[var(--mut)]">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm font-semibold">Loading staff list…</span>
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <p className="text-[var(--mut)] font-semibold text-sm">No admin users found.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--divider)] hover:bg-transparent">
                <TableHead className={th}>Name</TableHead>
                <TableHead className={th}>Email</TableHead>
                <TableHead className={th}>Role</TableHead>
                <TableHead className={th}>Status</TableHead>
                <TableHead className={th}>Last Login</TableHead>
                <TableHead className={th}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map(u => (
                <TableRow key={u.id} className="border-[var(--divider)] hover:bg-black/[0.015]">
                  <TableCell className={tdStrong}>{u.full_name}</TableCell>
                  <TableCell className={td}>{u.email}</TableCell>
                  <TableCell className={td}>
                    <Badge variant="outline" className={cn('text-[10px] font-bold uppercase py-0.5', ROLE_COLORS[u.role] ?? 'bg-gray-100')}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </Badge>
                  </TableCell>
                  <TableCell className={td}>
                    <span
                      onClick={() => handleToggleActive(u)}
                      className={cn(
                        'inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-extrabold uppercase rounded-full tracking-wider cursor-pointer whitespace-nowrap',
                        u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                      )}
                    >
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </TableCell>
                  <TableCell className={td}>{fmtTimeAgo(u.last_login)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg text-[var(--mut)] hover:text-[var(--ink)]" onClick={() => setViewUser(u)}>
                        <Eye size={13} />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg text-[var(--mut)] hover:text-[var(--ink)]" onClick={() => openEdit(u)}>
                        <Edit3 size={13} />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg text-[var(--mut)] hover:text-[var(--ink)]" onClick={() => handleToggleActive(u)}>
                        {u.is_active ? <ToggleRight size={15} className="text-[#16B364]" /> : <ToggleLeft size={15} className="text-gray-400" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg text-[var(--mut)] hover:text-[var(--ink)]" onClick={() => handleResetPassword(u)}>
                        <Key size={13} />
                      </Button>
                      {userRole === 'super_admin' && u.role !== 'super_admin' && (
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg text-[var(--accent)] hover:text-red-700" onClick={() => setConfirmDelete(u)}>
                          <Trash2 size={13} />
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

      {/* ── Add User Dialog ───────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Admin User</DialogTitle>
            <DialogDescription>Create a new administrative system account</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateUser} className="flex flex-col gap-4 py-2">

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
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--mut)]">Role</label>
              <select
                value={role}
                onChange={e => setRole(e.target.value)}
                className="h-9 rounded-xl glass border-0 px-3 text-xs font-bold uppercase tracking-wider text-[var(--mut)] outline-none cursor-pointer"
              >
                <option value="super_admin">Super Admin</option>
                <option value="admin">Admin</option>
                <option value="finance_admin">Finance Admin</option>
                <option value="verification_officer">Verification Officer</option>
              </select>
            </div>

            <div className="flex items-center gap-2 mt-1">
              <input
                type="checkbox"
                id="is_active_add"
                checked={isActive}
                onChange={e => setIsActive(e.target.checked)}
                className="rounded border-[var(--input-border)]"
              />
              <label htmlFor="is_active_add" className="text-xs font-bold text-[var(--ink)] cursor-pointer">Active</label>
            </div>

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={acting} style={{ background: 'var(--grad)', color: '#fff' }} className="gap-1.5 font-bold">
                {acting ? <Loader2 size={14} className="animate-spin" /> : 'Create User'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit User Dialog ──────────────────────────────── */}
      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Admin User</DialogTitle>
            <DialogDescription>Modify administrative user configurations</DialogDescription>
          </DialogHeader>

          {editUser && (
            <form onSubmit={handleUpdateUser} className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--mut)]">Full Name</label>
                <Input value={fullName} onChange={e => setFullName(e.target.value)} required className="h-9 text-xs" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--mut)]">Email</label>
                <Input type="email" value={email} disabled className="h-9 text-xs bg-gray-50 opacity-60" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--mut)]">Phone</label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} className="h-9 text-xs" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--mut)]">Role</label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className="h-9 rounded-xl glass border-0 px-3 text-xs font-bold uppercase tracking-wider text-[var(--mut)] outline-none cursor-pointer"
                >
                  <option value="super_admin">Super Admin</option>
                  <option value="admin">Admin</option>
                  <option value="finance_admin">Finance Admin</option>
                  <option value="verification_officer">Verification Officer</option>
                </select>
              </div>

              <div className="flex items-center gap-2 mt-1">
                <input
                  type="checkbox"
                  id="is_active_edit"
                  checked={isActive}
                  onChange={e => setIsActive(e.target.checked)}
                  className="rounded border-[var(--input-border)]"
                />
                <label htmlFor="is_active_edit" className="text-xs font-bold text-[var(--ink)] cursor-pointer">Active</label>
              </div>

              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
                <Button type="submit" disabled={acting} style={{ background: 'var(--grad)', color: '#fff' }} className="gap-1.5 font-bold">
                  {acting ? <Loader2 size={14} className="animate-spin" /> : 'Save Changes'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── View User Dialog ──────────────────────────────── */}
      <Dialog open={!!viewUser} onOpenChange={(open) => !open && setViewUser(null)}>
        <DialogContent className="sm:max-w-md">
          {viewUser && (
            <>
              <DialogHeader>
                <DialogTitle>{viewUser.full_name}</DialogTitle>
                <DialogDescription>Administrative Staff Member Details</DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-4 py-2 bg-white/40 rounded-xl p-4 border border-[var(--divider)]">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--mut)] block mb-0.5">Role</span>
                  <Badge variant="outline" className={cn('text-[10px] font-bold uppercase py-0.5', ROLE_COLORS[viewUser.role])}>
                    {ROLE_LABELS[viewUser.role] ?? viewUser.role}
                  </Badge>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--mut)] block mb-0.5">Status</span>
                  <span className={cn('text-xs font-bold', viewUser.is_active ? 'text-emerald-700' : 'text-red-700')}>
                    {viewUser.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--mut)] block mb-0.5">Email Address</span>
                  <span className="text-xs font-semibold text-[var(--ink)] flex items-center gap-1.5"><Mail size={12} /> {viewUser.email}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--mut)] block mb-0.5">Phone Number</span>
                  <span className="text-xs font-semibold text-[var(--ink)] flex items-center gap-1.5"><Phone size={12} /> {viewUser.phone || '—'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--mut)] block mb-0.5">Created At</span>
                  <span className="text-xs font-semibold text-[var(--ink)]">{fmtDate(viewUser.created_at)}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--mut)] block mb-0.5">Last Login</span>
                  <span className="text-xs font-semibold text-[var(--ink)]">{fmtTimeAgo(viewUser.last_login)}</span>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Confirmation Delete Dialog ────────────────────── */}
      <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[var(--accent)]">
              <ShieldAlert size={18} /> Confirm Delete Staff Account
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to completely delete the admin account for <strong>{confirmDelete?.full_name}</strong>? This action is irreversible.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" disabled={acting} onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={acting}
              onClick={handleDeleteUser}
              className="gap-1.5"
            >
              {acting ? <Loader2 size={14} className="animate-spin" /> : 'Delete Account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

function KPIItem({ label, value, icon: Icon, color }) {
  return (
    <div 
      className="stat-card glass p-6" 
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
