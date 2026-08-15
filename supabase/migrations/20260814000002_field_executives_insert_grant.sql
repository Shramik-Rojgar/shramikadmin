-- Allow authenticated admins to insert field_executives directly from the admin console.
grant insert, select, update, delete on public.field_executives to authenticated;
