-- important_days 权限修复：游客只读，登录后（后台/主页登录态）才能增删改
-- 用法：Supabase → SQL Editor → New query → 粘贴全部 → Run
-- 不会删除任何数据，只替换策略。

-- 清掉旧策略（兼容带引号和不带引号两版命名）
drop policy if exists "important_days_read" on public.important_days;
drop policy if exists "important_days_insert" on public.important_days;
drop policy if exists "important_days_update" on public.important_days;
drop policy if exists "important_days_delete" on public.important_days;
drop policy if exists important_days_read on public.important_days;
drop policy if exists important_days_insert on public.important_days;
drop policy if exists important_days_update on public.important_days;
drop policy if exists important_days_delete on public.important_days;

-- 游客（anon）：只能看
create policy "important_days_read" on public.important_days
  for select using (true);

-- 登录用户（authenticated）：可增删改
create policy "important_days_insert" on public.important_days
  for insert to authenticated with check (true);

create policy "important_days_update" on public.important_days
  for update to authenticated using (true) with check (true);

create policy "important_days_delete" on public.important_days
  for delete to authenticated using (true);
