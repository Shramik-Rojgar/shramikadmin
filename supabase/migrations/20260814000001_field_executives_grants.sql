-- Expose field_executives to authenticated users so RLS policies can evaluate.
-- Required for the admin console (SELECT, UPDATE) and for field executives (SELECT own row).
grant select, update on public.field_executives to authenticated;
