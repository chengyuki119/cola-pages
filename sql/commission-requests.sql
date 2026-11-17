-- ============================================================
-- Snow Yuzu · 手作素材/词库/定制申请（她 20261117 第二份任务书 第五部分 §7：安全可回滚迁移）
-- 日期：2026-11-17
-- 内容：① products 追加 name_raw / name_match（词库原始输入与识别结果溯源）
--      ② 新建 commission_requests（Commissions 定制申请，含可选素材快照）
--      ③ 三张表全部为增量变更：不删列、不改列型、不清数据、不动 RLS 既有规则
-- 特性：可安全重复执行（幂等）；文末附回滚脚本
-- ============================================================

-- ── 0. 执行前自检 ────────────────────────────────────────────────
-- 应返回 1 行且 prosecdef = t：
select proname, prosecdef from pg_proc where proname = 'shop_is_admin';

-- ── 1. products 词库溯源列（全部可空，默认空 → 老商品零影响）────
alter table public.products add column if not exists name_raw  text;
alter table public.products add column if not exists name_match jsonb;

-- ── 2. Commissions 定制申请表 ────────────────────────────────────
create table if not exists public.commission_requests (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,                 -- 联系邮箱（申请必填）
  note        text not null default '',      -- 需求描述
  materials   jsonb not null default '[]',   -- 所选素材快照 [{id,name,category,variant,qty,image}]
  status      text not null default 'pending', -- pending | done
  admin_note  text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function public.commission_requests_touch()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists commission_requests_touch on public.commission_requests;
create trigger commission_requests_touch before update on public.commission_requests
  for each row execute function public.commission_requests_touch();

-- ── 3. GRANT（匿名可投稿；管理员全权）────────────────────────────
grant select, insert, update, delete on public.commission_requests to authenticated;
grant insert on public.commission_requests to anon;

-- ── 4. RLS ───────────────────────────────────────────────────────
alter table public.commission_requests enable row level security;

-- 投稿（匿名/登录皆可）：邮箱必填、状态强制 pending、审核字段清空
drop policy if exists "commission_requests_insert" on public.commission_requests;
create policy "commission_requests_insert" on public.commission_requests
  for insert to anon, authenticated
  with check (
    email is not null and length(btrim(email)) > 0
    and status = 'pending'
    and admin_note = ''
  );

-- 读取/修改仅管理员（复用 shop_is_admin，与 Foodie 管理同边界）
drop policy if exists "commission_requests_admin_all" on public.commission_requests;
create policy "commission_requests_admin_all" on public.commission_requests
  for all to authenticated
  using (public.shop_is_admin()) with check (public.shop_is_admin());

-- ── 执行后自检 ──────────────────────────────────────────────────
-- ① 两列应存在且可空：
--    select column_name, is_nullable from information_schema.columns
--    where table_name='products' and column_name in ('name_raw','name_match');
-- ② 匿名 INSERT 应成功（email 非空）、缺 email 应被 RLS 拦
-- ③ 匿名 SELECT 应返回 0 行（无读 policy）；管理员登录后可读

-- ── 回滚脚本（仅删新增内容，不影响其他模块）──────────────────────
-- drop table if exists public.commission_requests;
-- drop function if exists public.commission_requests_touch();
-- alter table public.products drop column if exists name_raw;
-- alter table public.products drop column if exists name_match;
