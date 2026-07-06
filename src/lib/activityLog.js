import { supabase } from './supabase';

// Fire-and-forget audit trail write. Never throws — a logging failure
// must not block the admin action that triggered it.
export async function logActivity(action, { entityType, entityId, description, metadata } = {}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: adminRow } = await supabase
      .from('admin_users')
      .select('full_name')
      .eq('id', user.id)
      .single();

    await supabase.from('admin_activity_logs').insert({
      admin_id: user.id,
      admin_email: user.email,
      admin_name: adminRow?.full_name ?? null,
      action,
      entity_type: entityType ?? null,
      entity_id: entityId ?? null,
      description,
      metadata: metadata ?? null,
    });
  } catch (err) {
    console.error('[activityLog]', err);
  }
}
