-- 提问箱数据库设置
-- 用法：打开 Supabase 网页 → 你的项目 → 左侧 SQL Editor → New query
--       把这个文件里的全部内容粘贴进去，点 Run 运行一次即可

-- 提问表（公开：所有人可读、可匿名插入；回复只能由后台修改）
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  reply text,
  created_at timestamptz not null default now(),
  replied_at timestamptz
);

-- 联系方式表（私密：只能写入，不能读取 —— 只有你的后台用密钥能看）
create table if not exists public.contacts (
  question_id uuid primary key references public.questions(id) on delete cascade,
  contact text not null,
  created_at timestamptz not null default now()
);

alter table public.questions enable row level security;
alter table public.contacts enable row level security;

-- 所有人可以看提问和回复
drop policy if exists "public read questions" on public.questions;
create policy "public read questions" on public.questions for select using (true);

-- 所有人可以匿名投递提问
drop policy if exists "public insert questions" on public.questions;
create policy "public insert questions" on public.questions for insert with check (true);

-- 所有人可以投递联系方式（但没有任何人能读取，除了你的后台密钥）
drop policy if exists "public insert contacts" on public.contacts;
create policy "public insert contacts" on public.contacts for insert with check (true);

-- 注意：没有创建 update / delete 策略，
-- 所以游客不能改、不能删任何内容；你的后台用 service_role 密钥不受限制。
