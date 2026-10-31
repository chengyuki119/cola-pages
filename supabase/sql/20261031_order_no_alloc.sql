-- ════════════════════════════════════════════════════════════════════════════
-- Snow Yuzu 订单编号自动分配（末尾补位）
-- 文件：site/supabase/sql/20261031_order_no_alloc.sql
-- 日期：2026-10-30
--
-- 规则（她 2026-10-30 23:41 任务书）：
--   下一个编号 = (真实存在的订单里最大的 SY 序号) + 1
--   · 末尾删掉的号可以补回来（max 掉下去，+1 正好是那个空位）
--   · 中间删掉的号不补（max 没变，+1 只会往前走）
--   · 归档 / 取消 / 退款 / 只是被某人从自己视图里隐藏 → 号仍然占用（订单行还在，max 就不降）
--   这条公式能同时覆盖她表格里的 6 种情况，不需要额外分支。
--
-- 不碰：shop_orders 表结构、订单状态机触发器、任何已有数据、任何已有函数签名。
-- 本脚本只做三件事：加一张「号码占位表」、加一个分配函数、把现有两个分配函数改成调用它。
-- ════════════════════════════════════════════════════════════════════════════

-- ── 0. 备份现有函数定义（回滚用，不动任何东西）────────────────────────────────
create table if not exists public.shop_order_no_backup (
  at    timestamptz not null default now(),
  fn    text,
  defn  text
);

do $$
begin
  insert into public.shop_order_no_backup (fn, defn)
  select p.proname, pg_get_functiondef(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('shop_next_order_no', 'shop_next_order_no_inner', 'shop_place_order');
  raise notice '已备份函数定义 % 条', (select count(*) from public.shop_order_no_backup);
exception when others then
  raise notice '备份函数定义时出错（不影响后续）：% (%)', sqlerrm, sqlstate;
end $$;

-- ── 1. 号码占位表：解决「两个人同时下单拿到同一个号」 ──────────────────────────
create table if not exists public.shop_order_no_reserved (
  order_no   text primary key,
  issued_at  timestamptz not null default now(),
  issued_by  text
);
create index if not exists shop_order_no_reserved_at_idx on public.shop_order_no_reserved (issued_at);

alter table public.shop_order_no_reserved enable row level security;
revoke all on public.shop_order_no_reserved from anon, authenticated;

comment on table public.shop_order_no_reserved is
  '订单号占位：分配出去但订单还没落库的号先占住，防止并发拿到同一个号；超过 30 分钟没落库就自动释放。';

-- ── 2. 分配器本体 ───────────────────────────────────────────────────────────
create or replace function public.shop_alloc_order_no(p_hold_minutes int default 30)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max  int := 0;
  v_next int;
  v_no   text;
  v_got  text;
  v_try  int := 0;
begin
  -- 串行化：同一瞬间只有一个分配器在算号（事务级咨询锁，函数返回时自动释放）
  perform pg_advisory_xact_lock(918273645);

  -- 释放过期占位（分配了但一直没建单的号，超时就还回去）
  delete from public.shop_order_no_reserved
   where issued_at < now() - make_interval(mins => greatest(1, coalesce(p_hold_minutes, 30)));

  loop
    v_try := v_try + 1;

    -- ① 真实存在的订单里最大的 SY 序号。只看订单行，不看任何用户的删除/归档标记。
    select coalesce(max(substr(order_no, 4)::int), 0)
      into v_max
      from public.shop_orders
     where order_no ~ '^SY-[0-9]{1,9}$';

    -- ② 已经分配出去、订单还没落库的号也要算进来，否则并发会撞号
    select greatest(v_max, coalesce(max(substr(order_no, 4)::int), 0))
      into v_max
      from public.shop_order_no_reserved
     where order_no ~ '^SY-[0-9]{1,9}$';

    v_next := v_max + 1;
    v_no   := 'SY-' || lpad(v_next::text, 3, '0');

    insert into public.shop_order_no_reserved (order_no, issued_by)
    values (v_no, coalesce(auth.uid()::text, session_user))
    on conflict (order_no) do nothing
    returning order_no into v_got;

    if v_got is not null then
      return v_no;                       -- 占位成功
    end if;

    if v_try >= 8 then
      raise exception '订单编号分配失败：连续 8 次都撞号，请稍后重试' using errcode = 'P0001';
    end if;
    -- 撞了就再来一轮（下一轮的 max 会把刚才那个号算进去，自然往后走）
  end loop;
end;
$$;

comment on function public.shop_alloc_order_no(int) is
  '统一订单号分配：max(现有订单 SY 序号)+1，末尾空号自动补位，中间空号不回填；带咨询锁 + 占位表，并发安全。';

-- ── 3. 把现有两个分配函数改成调用新分配器（签名不变：无参数、返回 text）──────────
do $$
begin
  begin
    execute $f$
      create or replace function public.shop_next_order_no_inner()
      returns text
      language plpgsql
      security definer
      set search_path = public
      as $body$
      begin
        return public.shop_alloc_order_no(30);
      end;
      $body$;
    $f$;
    raise notice 'shop_next_order_no_inner 已改为调用 shop_alloc_order_no';
  exception when others then
    raise notice 'shop_next_order_no_inner 替换失败：% (%)', sqlerrm, sqlstate;
  end;

  begin
    execute $f$
      create or replace function public.shop_next_order_no()
      returns text
      language plpgsql
      security definer
      set search_path = public
      as $body$
      begin
        if not coalesce(public.shop_is_admin(), false) then
          raise exception '没有权限' using errcode = 'P0001';
        end if;
        return public.shop_alloc_order_no(30);
      end;
      $body$;
    $f$;
    raise notice 'shop_next_order_no 已改为调用 shop_alloc_order_no';
  exception when others then
    raise notice 'shop_next_order_no 替换失败：% (%)', sqlerrm, sqlstate;
  end;
end $$;

-- ── 4. 权限：匿名不能自己算号（除了 shop_next_order_no_inner 保持原样，游客下单要用）──
revoke all on function public.shop_alloc_order_no(int) from public, anon;
grant execute on function public.shop_alloc_order_no(int) to authenticated, service_role;

-- shop_next_order_no_inner 原本就是游客可调用（游客下单链路在用它），这里明确保留
grant execute on function public.shop_next_order_no_inner() to authenticated, anon, service_role;

-- shop_next_order_no 只要登录管理员（现状如此：匿名调用会被拒）
grant execute on function public.shop_next_order_no() to authenticated, service_role;

-- ── 5. 自检：跑完把这段的输出发我，我据此确认是否真的生效 ─────────────────────
select 'shop_order_no_reserved 表' as 检查项,
       (to_regclass('public.shop_order_no_reserved') is not null)::text as 结果
union all
select 'shop_alloc_order_no 函数存在',
       exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
               where n.nspname='public' and p.proname='shop_alloc_order_no')::text
union all
select 'shop_next_order_no_inner 是否已指向新分配器（定义里应含 shop_alloc_order_no）',
       (select (position('shop_alloc_order_no' in pg_get_functiondef(p.oid)) > 0)::text
          from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname='shop_next_order_no_inner' limit 1)
union all
select 'shop_next_order_no 是否已指向新分配器（定义里应含 shop_alloc_order_no）',
       (select (position('shop_alloc_order_no' in pg_get_functiondef(p.oid)) > 0)::text
          from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname='shop_next_order_no' limit 1)
union all
select '现有 SY 号最大值',
       (select coalesce(max(substr(order_no,4)::int),0)::text from public.shop_orders where order_no ~ '^SY-[0-9]{1,9}$')
union all
select '匿名能不能调 shop_alloc_order_no（应为 false）',
       has_function_privilege('anon', 'public.shop_alloc_order_no(int)', 'execute')::text
union all
select '目前的下一号（应该是 SY-104）',
       coalesce((select 'SY-' || lpad((coalesce(max(substr(order_no,4)::int),0)+1)::text,3,'0')
                   from public.shop_orders where order_no ~ '^SY-[0-9]{1,9}$'), 'SY-001');

-- ── 6. 回滚（需要时单独执行）──────────────────────────────────────────────────
-- 用 0 段备份里的定义重建：select defn from public.shop_order_no_backup where fn='shop_next_order_no_inner';
-- drop function if exists public.shop_alloc_order_no(int);
-- drop table if exists public.shop_order_no_reserved;
