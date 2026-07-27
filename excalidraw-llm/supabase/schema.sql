-- ===================================================
-- EXCALIDRAW AI COPILOT (INQUISITIVE) SUPABASE SCHEMA
-- Public Schema Setup with Row Level Security (RLS)
-- ===================================================

-- 1. Create user_sessions table
create table if not exists public.user_sessions (
  session_id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  first_prompt text not null,
  turn_count integer default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Create session_turns table
create table if not exists public.session_turns (
  id uuid default gen_random_uuid() primary key,
  session_id text references public.user_sessions(session_id) on delete cascade not null,
  turn_id text not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  user_prompt text not null,
  chat_reply text not null,
  image_blob text,
  created_at timestamptz default now(),
  unique (session_id, turn_id)
);

-- 3. Enable Row Level Security (RLS)
alter table public.user_sessions enable row level security;
alter table public.session_turns enable row level security;

-- 4. Clean up existing policies for idempotency
drop policy if exists "Users can view own sessions" on public.user_sessions;
drop policy if exists "Users can insert own sessions" on public.user_sessions;
drop policy if exists "Users can update own sessions" on public.user_sessions;
drop policy if exists "Users can delete own sessions" on public.user_sessions;

drop policy if exists "Users can view own turns" on public.session_turns;
drop policy if exists "Users can insert own turns" on public.session_turns;
drop policy if exists "Users can update own turns" on public.session_turns;
drop policy if exists "Users can delete own turns" on public.session_turns;

-- 5. Create Authorization RLS Policies (Strict User Isolation)
create policy "Users can view own sessions" on public.user_sessions
  for select using (auth.uid() = user_id);

create policy "Users can insert own sessions" on public.user_sessions
  for insert with check (auth.uid() = user_id);

create policy "Users can update own sessions" on public.user_sessions
  for update using (auth.uid() = user_id);

create policy "Users can delete own sessions" on public.user_sessions
  for delete using (auth.uid() = user_id);

create policy "Users can view own turns" on public.session_turns
  for select using (auth.uid() = user_id);

create policy "Users can insert own turns" on public.session_turns
  for insert with check (auth.uid() = user_id);

create policy "Users can update own turns" on public.session_turns
  for update using (auth.uid() = user_id);

create policy "Users can delete own turns" on public.session_turns
  for delete using (auth.uid() = user_id);
