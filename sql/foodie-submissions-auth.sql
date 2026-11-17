-- ============================================================
-- Foodie · 添加餐厅改为登录制（她 20261117 改版任务书 §十）
-- 日期：2026-11-17
-- 作用：未登录用户不能提交餐厅推荐——数据库层硬保护：
--       ① 收回 anon 的 INSERT 权限并删除匿名插入 policy
--       ② 新增 authenticated 插入 policy（status 强制 pending）
--       ③ guard 触发器升级：非管理员必须已登录（auth.uid() 非空），
--          user_id 强制 = auth.uid()，联系邮箱缺省回填登录邮箱
-- 前提：foodie-phase2-submissions.sql 已执行
-- 特性：可安全重复执行（幂等）；文末附回滚脚本
-- ============================================================

-- ── 0. 执行前自检 ────────────────────────────────────────────────
-- 应返回 1 行且 prosecdef = t：
select proname, prosecdef from pg_proc where proname = 'shop_is_admin';

-- ── 1. 收回匿名 INSERT 权限 ──────────────────────────────────────
revoke insert on public.food_restaurant_submissions from anon;

-- ── 2. 删除匿名插入 policy ───────────────────────────────────────
drop policy if exists "food_submissions_anon_insert" on public.food_restaurant_submissions;

-- ── 3. 登录用户插入 policy（普通登录用户可投稿；审核字段只能 pending）──
drop policy if exists "food_submissions_auth_insert" on public.food_restaurant_submissions;
create policy "food_submissions_auth_insert" on public.food_restaurant_submissions
  for insert to authenticated with check (status = 'pending');

-- ── 4. guard 触发器升级：登录才能投稿 ────────────────────────────
create or replace function public.food_submissions_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.shop_is_admin() then
    if tg_op = 'INSERT' then
      -- 她 20261117 §十：未登录一律拒绝（数据库层硬保护，绕不过前端）
      if auth.uid() is null then
        raise exception 'foodie: 请先登录后再添加餐厅';
      end if;
      -- 联系邮箱：前端已带登录邮箱；万一缺失，回填 auth 邮箱
      if new.user_email is null or length(btrim(new.user_email)) = 0 then
        select u.email into new.user_email from auth.users u where u.id = auth.uid();
      end if;
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
-- ① anon INSERT 应报权限/被 RLS 拦（不再返回 201）：
--    匿名 POST /rest/v1/food_restaurant_submissions 应 4xx
-- ② 应返回 food_submissions_auth_insert：
--    select policyname, cmd from pg_policies
--    where tablename = 'food_restaurant_submissions';
-- ③ 登录用户投稿应成功且 user_id = 登录者、status = pending

-- ── 回滚脚本（恢复匿名投稿制，仅影响本表权限）────────────────────
-- grant insert on public.food_restaurant_submissions to anon;
-- drop policy if exists "food_submissions_auth_insert" on public.food_restaurant_submissions;
-- create policy "food_submissions_anon_insert" on public.food_restaurant_submissions
--   for insert to anon with check (status = 'pending');
