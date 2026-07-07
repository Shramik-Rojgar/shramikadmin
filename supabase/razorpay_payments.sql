-- Razorpay payment flow — run once in the Supabase SQL editor before
-- deploying the payment edge functions. Safe to re-run (idempotent).

-- Jobs are created as 'pending_payment' (invisible to workers, who only see
-- 'hiring') and flip to 'hiring' once the escrow payment is verified. The
-- original check constraint didn't allow that value, so extend it.
alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs add constraint jobs_status_check
  check (status in ('pending_payment', 'hiring', 'ongoing', 'completed', 'cancelled'));

-- Hirer payment lifecycle on the job itself:
--   pending → paid (verified capture) | failed (attempt failed, retryable)
--   paid → refunded / partially_refunded (admin-issued refunds)
alter table public.jobs
  add column if not exists payment_status text not null default 'pending';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'jobs_payment_status_check') then
    alter table public.jobs
      add constraint jobs_payment_status_check
      check (payment_status in ('pending', 'paid', 'failed', 'refunded', 'partially_refunded'));
  end if;
end $$;

-- Verified payments record the real method Razorpay reports (the old client
-- always wrote 'upi'), and payment rows now use 'created'/'failed' statuses.
-- Extend both check constraints to cover them.
alter table public.payments drop constraint if exists payments_payment_method_check;
alter table public.payments add constraint payments_payment_method_check
  check (payment_method in ('upi', 'card', 'netbanking', 'wallet', 'emi', 'paylater', 'bank_transfer'));

alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('created', 'authorized', 'captured', 'failed', 'refunded', 'pending', 'paid'));

-- payments.amount holds only the escrow (labour cost); the Razorpay charge
-- (2% fee + 18% GST on the fee) is stored separately here. The actual amount
-- collected by the gateway is amount + transaction_fee.
alter table public.payments
  add column if not exists transaction_fee numeric(12, 2) not null default 0;

-- Columns used by create-payment-order / verify-razorpay-payment / razorpay-webhook.
alter table public.payments add column if not exists razorpay_order_id text;
alter table public.payments add column if not exists razorpay_payment_id text;
alter table public.payments add column if not exists razorpay_signature text;
alter table public.payments add column if not exists failure_reason text;

-- One payments row per Razorpay order; makes webhook + verify idempotent.
create unique index if not exists payments_razorpay_order_id_key
  on public.payments (razorpay_order_id)
  where razorpay_order_id is not null;

create index if not exists payments_job_id_idx on public.payments (job_id);

-- RECOMMENDED HARDENING (uncomment after confirming nothing else relies on
-- direct client writes): jobs and payments are now written exclusively by the
-- edge functions using the service role, so anonymous/authenticated clients
-- should not be able to insert payments or mark escrow as funded themselves.
--
-- revoke insert, update on public.payments from anon, authenticated;
