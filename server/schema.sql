create table if not exists public.users (
  id text primary key,
  phone text not null unique,
  password_hash text not null,
  nickname text not null,
  is_admin boolean not null default false,
  created_at bigint not null
);

alter table public.users add column if not exists is_admin boolean not null default false;

create table if not exists public.item_posts (
  id bigserial primary key,
  title text not null,
  owner_user_id text not null,
  owner_name text not null,
  category text not null,
  price numeric not null default 0,
  deposit numeric not null default 0,
  location text not null,
  description text not null default '',
  status text not null default '可借',
  is_hidden boolean not null default false,
  hidden_reason text not null default '',
  created_at bigint not null,
  updated_at bigint not null
);

create table if not exists public.demand_posts (
  id text primary key,
  title text not null,
  publisher_user_id text not null,
  publisher_name text not null,
  category text not null,
  budget numeric not null default 0,
  location text not null,
  reward text not null default '可协商',
  description text not null default '',
  status text not null default '求借中',
  is_hidden boolean not null default false,
  hidden_reason text not null default '',
  created_at bigint not null,
  updated_at bigint not null
);

create table if not exists public.chat_sessions (
  id text primary key,
  item_id bigint not null,
  item_title text not null,
  lender_user_id text not null,
  lender_name text not null,
  borrower_user_id text not null,
  borrower_name text not null,
  status text not null default '借用协商中',
  before_photos jsonb not null default '[]'::jsonb,
  after_photos jsonb not null default '[]'::jsonb,
  created_at bigint not null,
  updated_at bigint not null
);

create table if not exists public.chat_messages (
  id bigserial primary key,
  session_id text not null references public.chat_sessions(id) on delete cascade,
  sender_user_id text not null,
  sender_name text not null,
  text text not null,
  time bigint not null
);

create index if not exists idx_messages_session_time on public.chat_messages(session_id, time);
create index if not exists idx_sessions_lender on public.chat_sessions(lender_user_id, updated_at);
create index if not exists idx_sessions_borrower on public.chat_sessions(borrower_user_id, updated_at);
create index if not exists idx_item_posts_owner on public.item_posts(owner_user_id, updated_at);
create index if not exists idx_item_posts_hidden on public.item_posts(is_hidden, updated_at);
create index if not exists idx_demand_posts_owner on public.demand_posts(publisher_user_id, updated_at);
create index if not exists idx_demand_posts_hidden on public.demand_posts(is_hidden, updated_at);
