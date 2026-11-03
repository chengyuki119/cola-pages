-- ═══════════════════════════════════════════════════════════
--  她 20261102：稿件名字「首页 ≠ /works/ ≠ 后台」根治
--  根因：yuki_exclusive_get 读 yuki_exclusive 表，而后台保存的是
--        site_settings——两份数据会漂移（改名时同步失败前台就变旧名字）。
--  本修法：RPC 直接读 site_settings（单一数据源），yuki_exclusive 表
--        保留不动（后台每次保存仍会双写，从此不再被读取）。
--  数据零改动，只重建一个函数（同名同签名，可重复执行）。
--  回滚：装回 20261027-192544/sql/专属身份RPC修复-SQL7 第⑤步的旧定义。
-- ═══════════════════════════════════════════════════════════

-- ① 诊断输出：留档当前定义（执行后结果区可见）
select proname, pg_get_functiondef(oid)
from pg_proc
where proname = 'yuki_exclusive_get';

-- ② 重建 yuki_exclusive_get：白名单/ping 逻辑原样，works/bjds/cards 改读 site_settings
create or replace function public.yuki_exclusive_get(p_kind text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email   text;
  v_payload json;
begin
  v_email := lower(btrim(coalesce(
    current_setting('request.jwt.claims', true)::json ->> 'email', ''
  )));
  if v_email is null or v_email = '' then
    raise exception '请先登录';
  end if;
  if not exists (
    select 1 from public.yuki_exclusive_emails
    where lower(btrim(email)) = v_email
  ) then
    raise exception '此内容仅限柚子专属账号访问';
  end if;
  if p_kind = 'ping' then
    return json_build_object('ok', true, 'email', v_email);
  end if;
  -- 单一数据源：直接读 site_settings（后台「稿件/BJD/色卡管理」保存的同一份）
  if p_kind in ('works', 'bjds', 'cards') then
    begin
      select value::json into v_payload from public.site_settings where key = p_kind;
    exception when others then
      v_payload := null;
    end;
    if v_payload is null then
      return '[]'::json;
    end if;
    return v_payload;
  end if;
  -- 其余 kind 仍读旧表（当前没有用到，保底）
  select payload into v_payload from public.yuki_exclusive where kind = p_kind;
  if v_payload is null then
    return '[]'::json;
  end if;
  return v_payload;
end;
$$;

-- ③ 权限（create or replace 会保留旧 grant，这里原样补一遍保平安）
grant execute on function public.yuki_exclusive_get(text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════
--  跑完后的验证：前台（首页 Works 区 / /works/ / BJD / 色卡）重新
--  登录刷新一次，显示内容应与后台完全一致。
--  Cola 会在你跑完后用浏览器实测并回报结果。
-- ═══════════════════════════════════════════════════════════
