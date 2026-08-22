-- Allow field executives / public sign-up to register labourers with minimal
-- details. Non-critical profile fields can be filled in later by an admin.
alter table public.labourers
  alter column date_of_birth drop not null,
  alter column gender drop not null,
  alter column experience_level drop not null,
  alter column locality drop not null,
  alter column city drop not null,
  alter column state drop not null;
