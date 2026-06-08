-- Reports table for message and post reports
create table if not exists public.reports (
  id uuid default gen_random_uuid() primary key,
  reporter_id uuid references auth.users(id) on delete cascade not null,
  reported_user_id uuid references auth.users(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  post_id uuid references public.posts(id) on delete set null,
  reason text not null check (char_length(reason) >= 3 and char_length(reason) <= 200),
  details text check (char_length(details) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'resolved', 'dismissed')),
  created_at timestamp with time zone default now() not null,
  -- Prevent duplicate reports for same content by same user
  unique (reporter_id, message_id),
  unique (reporter_id, post_id)
);

-- RLS
alter table public.reports enable row level security;

-- Anyone can insert a report (their own)
create policy "Users can create reports"
  on public.reports for insert
  with check (auth.uid() = reporter_id);

-- Users can see their own reports
create policy "Users can view own reports"
  on public.reports for select
  using (auth.uid() = reporter_id);

-- Index for admin review queries
create index if not exists idx_reports_status on public.reports(status);
create index if not exists idx_reports_created_at on public.reports(created_at desc);
