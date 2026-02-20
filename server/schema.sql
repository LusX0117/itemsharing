begin;

-- 用户
create table if not exists public.users (
  id text primary key,
  phone text not null unique,
  password_hash text not null,
  nickname text not null,
  is_admin boolean not null default false,
  created_at bigint not null
);

-- 老版本兼容
alter table public.users add column if not exists is_admin boolean not null default false;
alter table public.users add column if not exists created_at bigint not null default (extract(epoch from now()) * 1000)::bigint;

-- 出借帖子
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

-- 求借帖子
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

-- 聊天会话
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

-- 聊天消息
create table if not exists public.chat_messages (
  id bigserial primary key,
  session_id text not null references public.chat_sessions(id) on delete cascade,
  sender_user_id text not null,
  sender_name text not null,
  text text not null,
  time bigint not null
);

-- 会话评价
create table if not exists public.session_ratings (
  id bigserial primary key,
  session_id text not null references public.chat_sessions(id) on delete cascade,
  rater_user_id text not null,
  target_user_id text not null,
  score integer not null check (score >= 1 and score <= 5),
  comment text not null default '',
  created_at bigint not null,
  unique (session_id, rater_user_id)
);

-- 会话已读进度
create table if not exists public.session_reads (
  user_id text not null,
  session_id text not null references public.chat_sessions(id) on delete cascade,
  last_read_message_id bigint not null default 0,
  updated_at bigint not null,
  primary key (user_id, session_id)
);

-- 索引
create index if not exists idx_messages_session_time on public.chat_messages(session_id, time);
create index if not exists idx_sessions_lender on public.chat_sessions(lender_user_id, updated_at);
create index if not exists idx_sessions_borrower on public.chat_sessions(borrower_user_id, updated_at);
create index if not exists idx_item_posts_owner on public.item_posts(owner_user_id, updated_at);
create index if not exists idx_item_posts_hidden on public.item_posts(is_hidden, updated_at);
create index if not exists idx_demand_posts_owner on public.demand_posts(publisher_user_id, updated_at);
create index if not exists idx_demand_posts_hidden on public.demand_posts(is_hidden, updated_at);
create index if not exists idx_ratings_session_target on public.session_ratings(session_id, target_user_id, created_at);
create index if not exists idx_ratings_target on public.session_ratings(target_user_id, created_at);
create index if not exists idx_session_reads_user_updated on public.session_reads(user_id, updated_at);

-- RLS
alter table public.users enable row level security;
alter table public.item_posts enable row level security;
alter table public.demand_posts enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.session_ratings enable row level security;
alter table public.session_reads enable row level security;

-- 当前后端使用 service role key 访问，这里仅放行 service_role
drop policy if exists users_service_role_all on public.users;
create policy users_service_role_all on public.users
  for all to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists item_posts_service_role_all on public.item_posts;
create policy item_posts_service_role_all on public.item_posts
  for all to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists demand_posts_service_role_all on public.demand_posts;
create policy demand_posts_service_role_all on public.demand_posts
  for all to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists chat_sessions_service_role_all on public.chat_sessions;
create policy chat_sessions_service_role_all on public.chat_sessions
  for all to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists chat_messages_service_role_all on public.chat_messages;
create policy chat_messages_service_role_all on public.chat_messages
  for all to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists session_ratings_service_role_all on public.session_ratings;
create policy session_ratings_service_role_all on public.session_ratings
  for all to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists session_reads_service_role_all on public.session_reads;
create policy session_reads_service_role_all on public.session_reads
  for all to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

commit;
