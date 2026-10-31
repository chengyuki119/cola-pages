-- ════════════════════════════════════════════════════════════════════════════
-- Snow Yuzu 订单视图标记（删除 / 归档）· 用户作用域隔离
-- 文件：site/supabase/sql/20261031_order_view_marks.sql
-- 日期：2026-10-30
--
-- 这一份解决什么：
--   1. 删除登记不再用一个全局 JSON 名单（那样谁删都在同一份名单里，卖家删了管理员也看不见）
--   2. 归档不再靠改订单状态（shop_orders 的状态机触发器不允许 archived）
--   3. 并发安全：靠唯一索引 (order_id, viewer_id, kind)，不是「读出来 → 改 → 写回去」
--   4. 所有写操作只能走 RPC，RPC 里用 auth.uid() 认人，前端伪造不了 viewer_id
--
-- 不碰的东西：shop_orders 表结构、状态机触发器、触发器、付款/退款/物流/邮件/日志表
-- ════════════════════════════════════════════════════════════════════════════

-- ── 0. 执行前快照（只读，留个底）────────────────────────────────────────────
create table if not exists public.order_marks_pre_20261031 as
select now() as snap_at,
       (select count(*) from public.shop_orders)          as orders_total,
       (select count(*) from public.shop_admins)          as admins_total,
       (select count(*) from public.shop_order_logs)      as logs_total,
       (select count(*) from public.shop_payments)        as payments_total,
       (select count(*) from public.site_settings)        as settings_total;

-- ── 1. 标记表 ────────────────────────────────────────────────────────────────
create table if not exists public.shop_order_marks (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.shop_orders(id) on delete cascade,
  viewer_id     uuid not null,                    -- 谁的视图：auth.uid()
  viewer_scope  text not null default 'admin'
                check (viewer_scope in ('admin', 'seller', 'buyer')),
  kind          text not null check (kind in ('deleted', 'archived')),
  order_no      text,
  from_status   text,
  total         numeric,
  currency      text,
  paid          numeric,
  buyer_name    text,
  created_at    timestamptz not null default now(),
  created_by    text,
  -- 同一个人对同一单同一种标记只能有一条：并发双击也不会写两条
  constraint shop_order_marks_uniq unique (order_id, viewer_id, kind)
);

create index if not exists shop_order_marks_viewer_idx on public.shop_order_marks (viewer_id, kind);
create index if not exists shop_order_marks_order_idx  on public.shop_order_marks (order_id);

comment on table  public.shop_order_marks is '每个用户各自的订单视图标记：deleted=从我的列表里删掉，archived=从我的列表里收进归档。原始订单行永不改动。';
comment on column public.shop_order_marks.viewer_id is '标记属于谁（= auth.uid()）。换个人看，这笔单照旧出现。';

-- ── 2. RLS：读只看自己的，写一律走 RPC ──────────────────────────────────────
alter table public.shop_order_marks enable row level security;

drop policy if exists shop_order_marks_sel on public.shop_order_marks;
create policy shop_order_marks_sel on public.shop_order_marks
  for select to authenticated
  using (viewer_id = auth.uid());

-- 不建 insert / update / delete 策略 → 任何人（含 authenticated）都不能直接写表，
-- 只能通过下面三个 security definer 的 RPC 写，RPC 里自己认人。
revoke all    on public.shop_order_marks from anon;
revoke insert, update, delete on public.shop_order_marks from authenticated;
grant  select on public.shop_order_marks to authenticated;

-- ── 3. 身份判定 ──────────────────────────────────────────────────────────────
-- 当前调用者能对订单做什么：'admin' = 全站管理；'seller' = 只有自己名下的单；null = 没资格
create or replace function public.shop_mark_scope()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return null;
  end if;
  -- 网站管理员（shop_admins.role = 'owner'）→ 全站
  if exists (select 1 from public.shop_admins where user_id = v_uid and role = 'owner') then
    return 'admin';
  end if;
  -- 卖家角色目前库里还不存在（shop_admins.role 只有 owner / readonly）。
  -- 等卖家体系建起来后，在这里加一条：role = 'seller' → return 'seller'
  return null;
end;
$$;

-- 当前调用者能不能碰这一笔订单
create or replace function public.shop_can_mark_order(p_order_id uuid, p_kind text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope text := public.shop_mark_scope();
  v_uid   uuid := auth.uid();
begin
  if v_scope is null then
    return false;
  end if;
  if p_kind not in ('deleted', 'archived') then
    return false;
  end if;
  if not exists (select 1 from public.shop_orders where id = p_order_id) then
    return false;
  end if;
  if v_scope = 'admin' then
    return true;
  end if;
  return false;  -- seller 分支等卖家字段建好后再打开
end;
$$;

-- ── 4. RPC：读取我的全部标记 ─────────────────────────────────────────────────
create or replace function public.shop_order_marks()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_scope text := public.shop_mark_scope();
  v_out  jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'msg', '未登录', 'deleted', '[]'::jsonb, 'archived', '[]'::jsonb);
  end if;
  if v_scope is null then
    return jsonb_build_object('ok', false, 'code', 'NO_PERM', 'msg', '这个账号没有管理订单的权限', 'deleted', '[]'::jsonb, 'archived', '[]'::jsonb);
  end if;

  select jsonb_build_object(
           'ok', true,
           'scope', v_scope,
           'deleted', coalesce((select jsonb_agg(jsonb_build_object(
                          'id', order_id, 'order_no', order_no, 'from', from_status,
                          'total', total, 'currency', currency, 'paid', paid,
                          'buyer', buyer_name, 'at', created_at, 'by', created_by))
                        from public.shop_order_marks
                       where viewer_id = v_uid and kind = 'deleted'), '[]'::jsonb),
           'archived', coalesce((select jsonb_agg(jsonb_build_object(
                          'id', order_id, 'order_no', order_no, 'from', from_status,
                          'total', total, 'currency', currency, 'paid', paid,
                          'buyer', buyer_name, 'at', created_at, 'by', created_by))
                        from public.shop_order_marks
                       where viewer_id = v_uid and kind = 'archived'), '[]'::jsonb)
         ) into v_out;
  return v_out;
end;
$$;

-- ── 5. RPC：打一个标记（删除 / 归档）─────────────────────────────────────────
create or replace function public.shop_order_mark(p_order_id uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_scope text := public.shop_mark_scope();
  v_o     public.shop_orders;
  v_no    text;
  v_detail text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'msg', '登录已失效，请重新登录后台');
  end if;
  if v_scope is null then
    return jsonb_build_object('ok', false, 'code', 'NO_PERM', 'msg', '这个账号没有管理订单的权限');
  end if;
  if p_kind not in ('deleted', 'archived') then
    return jsonb_build_object('ok', false, 'code', 'BAD_KIND', 'msg', '标记类型不对：' || coalesce(p_kind, 'null'));
  end if;
  if not public.shop_can_mark_order(p_order_id, p_kind) then
    return jsonb_build_object('ok', false, 'code', 'NO_PERM_ORDER', 'msg', '这笔订单不存在，或者不在你能管理的范围内');
  end if;

  select * into v_o from public.shop_orders where id = p_order_id;
  v_no := coalesce(v_o.order_no, left(p_order_id::text, 8));

  -- 已删除的订单不能再归档
  if p_kind = 'archived'
     and exists (select 1 from public.shop_order_marks
                  where order_id = p_order_id and viewer_id = v_uid and kind = 'deleted') then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_DELETED', 'msg', '这笔订单已经删除了，不能再归档');
  end if;

  if p_kind = 'archived'
     and exists (select 1 from public.shop_order_marks
                  where order_id = p_order_id and viewer_id = v_uid and kind = 'archived') then
    return jsonb_build_object('ok', true, 'code', 'ALREADY', 'msg', '这笔订单已经归档过了');
  end if;

  -- 同一种标记已经存在就不重复写，也不重复写审计（避免重复点击刷出一堆同一条日志）
  if exists (select 1 from public.shop_order_marks
              where order_id = p_order_id and viewer_id = v_uid and kind = p_kind) then
    return jsonb_build_object('ok', true, 'code', 'ALREADY', 'msg',
      case when p_kind = 'deleted' then '这笔订单已经删除过了' else '这笔订单已经归档过了' end);
  end if;

  insert into public.shop_order_marks
    (order_id, viewer_id, viewer_scope, kind, order_no, from_status, total, currency, paid, buyer_name, created_by)
  values
    (p_order_id, v_uid, v_scope, p_kind, v_no, v_o.status, v_o.total, coalesce(v_o.currency, 'USD'),
     coalesce(v_o.pay_amount, 0),
     coalesce((v_o.address ->> 'name'), v_o.email),
     v_scope || ':' || v_uid::text)
  on conflict (order_id, viewer_id, kind) do nothing;

  v_detail := 'order_no:' || v_no ||
              '; from:' || coalesce(v_o.status, '') ||
              '; total:' || coalesce(v_o.total::text, '0') ||
              '; paid:' || coalesce(v_o.pay_amount::text, '0') ||
              '; scope:' || v_scope ||
              '; by:' || v_uid::text;

  -- 服务端自己写审计，前端造假不了操作人
  insert into public.shop_order_logs (order_id, actor, action, detail)
  values (p_order_id, v_scope || ':' || v_uid::text,
          case when p_kind = 'deleted' then 'delete' else 'archive' end,
          v_detail);

  return jsonb_build_object('ok', true, 'code', 'OK', 'msg',
    case when p_kind = 'deleted' then '已删除' else '已归档' end);
end;
$$;

-- ── 6. RPC：取消标记（恢复归档）──────────────────────────────────────────────
create or replace function public.shop_order_unmark(p_order_id uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_scope text := public.shop_mark_scope();
  v_no    text;
  v_from  text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'msg', '登录已失效，请重新登录后台');
  end if;
  if v_scope is null then
    return jsonb_build_object('ok', false, 'code', 'NO_PERM', 'msg', '这个账号没有管理订单的权限');
  end if;
  if p_kind not in ('deleted', 'archived') then
    return jsonb_build_object('ok', false, 'code', 'BAD_KIND', 'msg', '标记类型不对');
  end if;

  select order_no, from_status into v_no, v_from
    from public.shop_order_marks
   where order_id = p_order_id and viewer_id = v_uid and kind = p_kind;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_MARKED', 'msg',
      case when p_kind = 'deleted' then '这笔订单没有被删除，不需要恢复' else '这笔订单没有归档，不需要恢复' end);
  end if;

  delete from public.shop_order_marks
   where order_id = p_order_id and viewer_id = v_uid and kind = p_kind;

  insert into public.shop_order_logs (order_id, actor, action, detail)
  values (p_order_id, v_scope || ':' || v_uid::text, 'un' || p_kind,
          'order_no:' || coalesce(v_no, left(p_order_id::text, 8)) ||
          '; from:' || coalesce(v_from, '') ||
          '; scope:' || v_scope ||
          '; by:' || v_uid::text);

  return jsonb_build_object('ok', true, 'code', 'OK', 'msg', '已恢复');
end;
$$;

-- ── 7. 函数权限：只给登录用户，绝不给匿名 ───────────────────────────────────
revoke all on function public.shop_mark_scope()                 from public, anon;
revoke all on function public.shop_can_mark_order(uuid, text)   from public, anon;
revoke all on function public.shop_order_marks()                from public, anon;
revoke all on function public.shop_order_mark(uuid, text)       from public, anon;
revoke all on function public.shop_order_unmark(uuid, text)     from public, anon;

grant execute on function public.shop_mark_scope()               to authenticated;
grant execute on function public.shop_can_mark_order(uuid, text) to authenticated;
grant execute on function public.shop_order_marks()              to authenticated;
grant execute on function public.shop_order_mark(uuid, text)     to authenticated;
grant execute on function public.shop_order_unmark(uuid, text)   to authenticated;

-- ── 8. 自检 ─────────────────────────────────────────────────────────────────
select 'table' as what, to_regclass('public.shop_order_marks')::text as v
union all select 'fn_marks',  exists(select 1 from pg_proc where proname = 'shop_order_marks')::text
union all select 'fn_mark',   exists(select 1 from pg_proc where proname = 'shop_order_mark')::text
union all select 'fn_unmark', exists(select 1 from pg_proc where proname = 'shop_order_unmark')::text
union all select 'fn_scope',  exists(select 1 from pg_proc where proname = 'shop_mark_scope')::text
union all select 'rls_on',    (select relrowsecurity from pg_class where relname = 'shop_order_marks')::text
union all select 'policies',  (select count(*) from pg_policies where tablename = 'shop_order_marks')::text;

-- ── 9. 回退（需要时单独执行）─────────────────────────────────────────────────
-- drop function if exists public.shop_order_unmark(uuid, text);
-- drop function if exists public.shop_order_mark(uuid, text);
-- drop function if exists public.shop_order_marks();
-- drop function if exists public.shop_can_mark_order(uuid, text);
-- drop function if exists public.shop_mark_scope();
-- drop table if exists public.shop_order_marks;
-- drop table if exists public.order_marks_pre_20261031;
