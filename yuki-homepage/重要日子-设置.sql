-- ═══════════ 重要日子 & 照片标记 设置 SQL ═══════════
-- 在 Supabase SQL Editor 里运行一次即可。
-- 包含：important_days 表（主页日历 + 管理后台同一套数据）
--       photos 表新增 pinned（置顶）/ home（主页展示）两个字段

-- 1. 重要日子表
create table if not exists important_days (
  id uuid primary key default gen_random_uuid(),
  name text not null,                  -- 名称，如：桓桓生日 / 买下这个东西
  day date not null,                   -- 日期 YYYY-MM-DD
  type text not null default 'event',  -- 类型：birthday 生日 / anniversary 纪念日 / event 重要日
  repeat text not null default 'none', -- 重复：none 不重复 / yearly 每年
  created_at timestamptz default now()
);

alter table important_days enable row level security;

drop policy if exists "important_days_read" on important_days;
create policy "important_days_read" on important_days for select using (true);

drop policy if exists "important_days_insert" on important_days;
create policy "important_days_insert" on important_days for insert with check (true);

drop policy if exists "important_days_update" on important_days;
create policy "important_days_update" on important_days for update using (true);

drop policy if exists "important_days_delete" on important_days;
create policy "important_days_delete" on important_days for delete using (true);

-- 2. 照片：置顶 / 主页展示
alter table photos add column if not exists pinned boolean default false;
alter table photos add column if not exists home boolean default false;
