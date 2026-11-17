-- ============================================================
-- Snow Yuzu · Our Little World 私人空间（她 20261117 02:22 任务书）
-- 日期：2026-11-17
-- 内容：双人邀请、绑定、授权与共享状态（位置/电量/设备/自定义状态）
-- 特性：全部增量新增表，不动现有表；RLS 服务端硬权限；
--      可安全重复执行（幂等）；文末附回滚脚本
-- ============================================================

-- ── 0. 执行前自检 ────────────────────────────────────────────────
-- 应返回 1 行且 prosecdef = t：
select proname, prosecdef from pg_proc where proname = 'shop_is_admin';

-- ── 1. 私人空间（一个空间最多两人，由触发器保证）─────────────────
create table if not exists public.couple_spaces (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id),
  space_name  text not null default 'Our Little World',
  created_at  timestamptz not null default now()
);

-- ── 2. 成员表（≤2；display 信息在加入时由 RPC 从 auth 写入快照）──
create table if not exists public.couple_members (
  space_id     uuid not null references public.couple_spaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'partner' check (role in ('owner','partner')),
  display_name text not null default '',
  email        text not null default '',
  joined_at    timestamptz not null default now(),
  primary key (space_id, user_id)
);

-- ── 3. 一次性邀请（有效期 7 天；接受后作废；可取消）──────────────
create table if not exists public.couple_invites (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.couple_spaces(id) on delete cascade,
  code        text not null unique,
  invited_by  uuid not null references auth.users(id),
  status      text not null default 'pending' check (status in ('pending','accepted','cancelled')),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  used_by     uuid references auth.users(id),
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- ── 4. 每人自己的授权（只可改自己那行；关闭某项立即停止收集）─────
create table if not exists public.couple_permissions (
  space_id           uuid not null references public.couple_spaces(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  share_location     boolean not null default false,
  share_battery      boolean not null default false,
  share_device       boolean not null default false,
  share_custom_status boolean not null default true,
  updated_at         timestamptz not null default now(),
  primary key (space_id, user_id)
);

-- ── 5. 共享状态（自定义状态 + 位置 + 电量 + 设备，一人一行）──────
-- 位置/电量只有在自己授权开启时才由前端写入（前端在授权关闭时不采集不写入）
create table if not exists public.couple_presence (
  space_id          uuid not null references public.couple_spaces(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  custom_status     text not null default '',
  status_source     text not null default 'manual' check (status_source in ('manual','system')),
  latitude          double precision,
  longitude         double precision,
  location_accuracy numeric,
  location_at       timestamptz,
  battery_level     smallint check (battery_level between 0 and 100),
  charging          boolean,
  battery_at        timestamptz,
  device_name       text,
  os_info           text,
  online_at         timestamptz,
  updated_at        timestamptz not null default now(),
  primary key (space_id, user_id)
);

-- ── 6. 触发器：一个空间最多两名成员 ──────────────────────────────
create or replace function public.couple_members_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.couple_members where space_id = new.space_id) >= 2 then
    raise exception 'olw: 这个私人空间已经有两个人了';
  end if;
  if (select count(*) from public.couple_members cm
      join public.couple_spaces cs on cs.id = cm.space_id
      where cm.user_id = new.user_id) >= 1 then
    raise exception 'olw: 你已经绑定了一个私人空间，不能再加入第二个';
  end if;
  return new;
end $$;

drop trigger if exists couple_members_guard on public.couple_members;
create trigger couple_members_guard before insert on public.couple_members
  for each row execute function public.couple_members_guard();

-- 触发器：presence / permissions 只能写自己、且必须是空间成员（纵深防御）
create or replace function public.couple_rows_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.couple_members
                 where space_id = new.space_id and user_id = new.user_id) then
    raise exception 'olw: 只能写入自己所在空间的自己的数据';
  end if;
  return new;
end $$;

drop trigger if exists couple_presence_guard on public.couple_presence;
create trigger couple_presence_guard before insert or update on public.couple_presence
  for each row execute function public.couple_rows_guard();

drop trigger if exists couple_permissions_guard on public.couple_permissions;
create trigger couple_permissions_guard before insert or update on public.couple_permissions
  for each row execute function public.couple_rows_guard();

-- ── 7. 成员判断函数（RLS 用，security definer 防递归）────────────
create or replace function public.couple_member_of(p_space uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.couple_members
                 where space_id = p_space and user_id = auth.uid());
$$;

create or replace function public.couple_space_of_mine()
returns uuid language sql stable security definer set search_path = public as $$
  select space_id from public.couple_members where user_id = auth.uid() limit 1;
$$;

-- ── 8. RLS ───────────────────────────────────────────────────────
alter table public.couple_spaces     enable row level security;
alter table public.couple_members    enable row level security;
alter table public.couple_invites    enable row level security;
alter table public.couple_permissions enable row level security;
alter table public.couple_presence   enable row level security;

-- 空间：成员可读；创建空间走 RPC
drop policy if exists "olw_spaces_read" on public.couple_spaces;
create policy "olw_spaces_read" on public.couple_spaces
  for select to authenticated using (public.couple_member_of(id));

-- 成员：空间内互相可见
drop policy if exists "olw_members_read" on public.couple_members;
create policy "olw_members_read" on public.couple_members
  for select to authenticated using (public.couple_member_of(space_id));
-- 成员删除走 RPC（解绑），不开放直删

-- 邀请：发起人可看自己的邀请并可读空间内邀请状态；创建/取消走 RPC
drop policy if exists "olw_invites_read" on public.couple_invites;
create policy "olw_invites_read" on public.couple_invites
  for select to authenticated
  using (invited_by = auth.uid() or public.couple_member_of(space_id));
drop policy if exists "olw_invites_update" on public.couple_invites;
create policy "olw_invites_update" on public.couple_invites
  for update to authenticated using (invited_by = auth.uid());

-- 授权：双方可见对方授权状态；只能写自己那行
drop policy if exists "olw_perm_read" on public.couple_permissions;
create policy "olw_perm_read" on public.couple_permissions
  for select to authenticated using (public.couple_member_of(space_id));
drop policy if exists "olw_perm_write" on public.couple_permissions;
create policy "olw_perm_write" on public.couple_permissions
  for insert to authenticated with check (user_id = auth.uid() and public.couple_member_of(space_id));
drop policy if exists "olw_perm_update" on public.couple_permissions;
create policy "olw_perm_update" on public.couple_permissions
  for update to authenticated using (user_id = auth.uid() and public.couple_member_of(space_id));

-- 共享状态：双方可见；只能写自己那行（位置/电量等由本人设备上报）
drop policy if exists "olw_pres_read" on public.couple_presence;
create policy "olw_pres_read" on public.couple_presence
  for select to authenticated using (public.couple_member_of(space_id));
drop policy if exists "olw_pres_write" on public.couple_presence;
create policy "olw_pres_write" on public.couple_presence
  for insert to authenticated with check (user_id = auth.uid() and public.couple_member_of(space_id));
drop policy if exists "olw_pres_update" on public.couple_presence;
create policy "olw_pres_update" on public.couple_presence
  for update to authenticated using (user_id = auth.uid() and public.couple_member_of(space_id));
drop policy if exists "olw_pres_delete" on public.couple_presence;
create policy "olw_pres_delete" on public.couple_presence
  for delete to authenticated using (user_id = auth.uid());

-- ── 9. RPC（security definer，绕过 RLS 做受控写）─────────────────

-- 9.1 创建空间（管理员/任一用户；一人只能有一个空间）
create or replace function public.couple_create_space(p_name text default 'Our Little World')
returns uuid language plpgsql security definer set search_path = public as $$
declare sid uuid; em text;
begin
  if auth.uid() is null then raise exception 'olw: 请先登录'; end if;
  select email into em from auth.users where id = auth.uid();
  if exists (select 1 from public.couple_members where user_id = auth.uid()) then
    raise exception 'olw: 你已经在一个私人空间里了';
  end if;
  insert into public.couple_spaces (owner_id, space_name) values (auth.uid(), coalesce(nullif(p_name,''), 'Our Little World'))
    returning id into sid;
  insert into public.couple_members (space_id, user_id, role, display_name, email)
    values (sid, auth.uid(), 'owner',
            coalesce((select u.raw_user_meta_data->>'name' from auth.users u where u.id = auth.uid()),
                     split_part(em, '@', 1)), em);
  insert into public.couple_permissions (space_id, user_id) values (sid, auth.uid());
  return sid;
end $$;

-- 9.2 生成一次性邀请（仅 owner；空间未满）
create or replace function public.couple_create_invite()
returns text language plpgsql security definer set search_path = public as $$
declare sid uuid; c text;
begin
  if auth.uid() is null then raise exception 'olw: 请先登录'; end if;
  select public.couple_space_of_mine() into sid;
  if sid is null then raise exception 'olw: 请先创建私人空间'; end if;
  if not exists (select 1 from public.couple_members where space_id = sid and user_id = auth.uid() and role = 'owner') then
    raise exception 'olw: 只有空间创建者可以发出邀请';
  end if;
  if (select count(*) from public.couple_members where space_id = sid) >= 2 then
    raise exception 'olw: 空间已满（两人）';
  end if;
  -- 取消旧的未接受邀请，保持一次只有一张有效邀请
  update public.couple_invites set status = 'cancelled'
    where space_id = sid and status = 'pending';
  c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  insert into public.couple_invites (space_id, code, invited_by) values (sid, c, auth.uid());
  return c;
end $$;

-- 9.3 接受邀请（邀请人以外的登录用户；一次性、有效期、空间未满、未绑定过）
create or replace function public.couple_accept_invite(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv record; em text;
begin
  if auth.uid() is null then raise exception 'olw: 请先登录'; end if;
  select * into inv from public.couple_invites
    where code = upper(trim(p_code)) and status = 'pending' limit 1;
  if inv.id is null then raise exception 'olw: 邀请码无效或已被使用'; end if;
  if inv.expires_at < now() then
    update public.couple_invites set status = 'cancelled' where id = inv.id;
    raise exception 'olw: 邀请已过期，请让对方重新生成';
  end if;
  if inv.invited_by = auth.uid() then raise exception 'olw: 不能接受自己发出的邀请'; end if;
  if exists (select 1 from public.couple_members where user_id = auth.uid()) then
    raise exception 'olw: 你已经绑定了一个私人空间';
  end if;
  if (select count(*) from public.couple_members where space_id = inv.space_id) >= 2 then
    raise exception 'olw: 这个空间已经有两个人了';
  end if;
  select email into em from auth.users where id = auth.uid();
  insert into public.couple_members (space_id, user_id, role, display_name, email)
    values (inv.space_id, auth.uid(), 'partner',
            coalesce((select u.raw_user_meta_data->>'nickname' from auth.users u where u.id = auth.uid()),
                     coalesce((select u.raw_user_meta_data->>'name' from auth.users u where u.id = auth.uid()), split_part(em, '@', 1))), em);
  insert into public.couple_permissions (space_id, user_id) values (inv.space_id, auth.uid());
  update public.couple_invites
    set status = 'accepted', used_by = auth.uid(), used_at = now()
    where id = inv.id;
  return inv.space_id;
end $$;

-- 9.4 取消邀请（发起人）
create or replace function public.couple_cancel_invite(p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'olw: 请先登录'; end if;
  update public.couple_invites set status = 'cancelled'
    where code = upper(trim(p_code)) and invited_by = auth.uid() and status = 'pending';
  return found;
end $$;

-- 9.5 解除绑定（任一成员；双方访问立即停止 + 删除共享数据）
create or replace function public.couple_unbind()
returns boolean language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if auth.uid() is null then raise exception 'olw: 请先登录'; end if;
  select public.couple_space_of_mine() into sid;
  if sid is null then raise exception 'olw: 你还没有绑定私人空间'; end if;
  delete from public.couple_presence where space_id = sid;      -- 共享数据一并删除
  delete from public.couple_permissions where space_id = sid;
  delete from public.couple_members where space_id = sid;        -- 双方成员关系立即解除
  update public.couple_invites set status = 'cancelled'
    where space_id = sid and status = 'pending';
  return true;
end $$;

-- ── 10. GRANT ────────────────────────────────────────────────────
grant select, insert, update, delete on public.couple_spaces,
  public.couple_members, public.couple_invites, public.couple_permissions,
  public.couple_presence to authenticated;
grant execute on function public.couple_create_space(text), public.couple_create_invite(),
  public.couple_accept_invite(text), public.couple_cancel_invite(text),
  public.couple_unbind() to authenticated;

-- ── 执行后自检 ──────────────────────────────────────────────────
-- ① 匿名读任何表都应为空（RLS 拦截）
-- ② 登录用户可 couple_create_space → couple_create_invite 拿到 8 位邀请码
-- ③ 另一账号 couple_accept_invite('码') 后 members = 2；第三个账号接受应报错「已经有两个人」
-- ④ 任一方 couple_unbind 后，双方 select 都为空（访问立即停止，数据已删）

-- ── 回滚脚本（仅删本次新增，不影响其他模块）──────────────────────
-- drop function if exists public.couple_unbind();
-- drop function if exists public.couple_cancel_invite(text);
-- drop function if exists public.couple_accept_invite(text);
-- drop function if exists public.couple_create_invite();
-- drop function if exists public.couple_create_space(text);
-- drop function if exists public.couple_member_of(uuid);
-- drop function if exists public.couple_space_of_mine();
-- drop table if exists public.couple_presence;
-- drop table if exists public.couple_permissions;
-- drop table if exists public.couple_invites;
-- drop table if exists public.couple_members;
-- drop table if exists public.couple_spaces;
