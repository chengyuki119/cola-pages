-- ============================================================
-- Foodie Map · Phase 2 投稿功能 · SQL 补丁
-- 日期：2026-11-15
-- 作用：放开匿名用户向 food_restaurant_submissions 投稿
--       （正式餐厅表 food_restaurants 仍然完全锁死，投稿只能进队列表）
-- 前提：foodie-phase1-migration.sql v2 已执行成功
-- 特性：可安全重复执行（幂等）；文末附回滚脚本
-- 自检：执行后运行文末「执行后自检」三句，应返回预期值
-- ============================================================

-- ── 0. 执行前自检（确认前提）────────────────────────────────────
-- 应返回 1 行（表已存在）：
select to_regclass('public.food_restaurant_submissions') as submissions_table;

-- ── 1. user_id 放开为可空 ────────────────────────────────────────
-- 匿名访客没有 JWT，auth.uid() 为 null；
-- 登录用户投稿时守卫仍会写入 auth.uid()，行为不变。
alter table public.food_restaurant_submissions
  alter column user_id drop not null;

-- ── 2. GRANT：匿名可插入投稿队列 ────────────────────────────────
grant insert on public.food_restaurant_submissions to anon;

-- ── 3. RLS 策略：匿名只能插入 pending 投稿，不能读不能改 ────────
-- （守卫触发器会强制 status='pending' 并清空审核字段，这里是第二道锁）
drop policy if exists "food_submissions_anon_insert" on public.food_restaurant_submissions;
create policy "food_submissions_anon_insert" on public.food_restaurant_submissions
  for insert to anon
  with check (status = 'pending');

-- ── 4. 守卫触发器增强：同邮箱最多 3 条待审投稿（防刷）────────────
-- 非管理员插入时，若该邮箱已有 3 条及以上 pending 投稿则拒绝；
-- 审核通过/拒绝后名额自动释放。匿名投稿必须留联系邮箱（前端表单校验）。
create or replace function public.food_submissions_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.shop_is_admin() then
    if tg_op = 'INSERT' then
      if new.user_email is null or length(btrim(new.user_email)) = 0 then
        raise exception 'foodie: 投稿请填写联系邮箱，方便我们与你确认细节';
      end if;
      if (select count(*) from public.food_restaurant_submissions
          where user_email = new.user_email and status = 'pending') >= 3 then
        raise exception 'foodie: 这个邮箱的待审投稿已经满 3 条啦，等我们处理后再投稿吧';
      end if;
      new.status = 'pending';
      new.user_id = auth.uid();
      new.admin_note = '';
      new.reviewed_at = null;
      new.reviewed_by = '';
      return new;
    end if;
    if tg_op = 'UPDATE' then
      if new.status is distinct from old.status
         or new.admin_note is distinct from old.admin_note
         or new.reviewed_at is distinct from old.reviewed_at
         or new.reviewed_by is distinct from old.reviewed_by then
        raise exception 'foodie: 投稿审核状态只有管理员可以修改';
      end if;
    end if;
  end if;
  return coalesce(new, old);
end $$;

-- ── 执行后自检 ──────────────────────────────────────────────────
-- ① 应返回 n（可空）：select attnotnull from pg_attribute
--    where attrelid = 'public.food_restaurant_submissions'::regclass and attname = 'user_id';
-- ② 应返回 anon：select grantee from information_schema.role_usage_grants
--    where object_name = 'food_restaurant_submissions' and privilege_type = 'INSERT';
-- ③ 应返回 2 行 policy（insert+anon_insert 等）：select policyname, cmd
--    from pg_policies where tablename = 'food_restaurant_submissions';

-- ── 回滚脚本（仅撤销本补丁，不影响其他 Foodie 数据）──────────────
-- drop policy if exists "food_submissions_anon_insert" on public.food_restaurant_submissions;
-- revoke insert on public.food_restaurant_submissions from anon;
-- alter table public.food_restaurant_submissions alter column user_id set not null;
-- （守卫函数如需还原，用 foodie-phase1-migration.sql v2 第 6 节的同名函数重建）
