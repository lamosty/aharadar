-- Budget resets table
-- Tracks when budget periods are reset, storing the credits used at reset time as an offset
-- When computing budget status, sum of offsets is subtracted from actual usage

create table if not exists budget_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  period text not null check (period in ('daily', 'monthly')),
  credits_at_reset numeric(12,6) not null default 0,
  reset_at timestamptz not null default now()
);

create index if not exists budget_resets_user_period_idx on budget_resets(user_id, period, reset_at desc);

comment on table budget_resets is 'Tracks budget reset events with credits offset for each period';
comment on column budget_resets.period is 'Period type: daily or monthly';
comment on column budget_resets.credits_at_reset is 'Credits used at time of reset - subtracted from future usage calculations';
