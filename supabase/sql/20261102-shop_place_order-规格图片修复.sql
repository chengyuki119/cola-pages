-- ════════════════════════════════════════════════════════════════════════════
-- Snow Yuzu · shop_place_order 规格下单修复（规格带图必炸的运算符错误）
-- 文件：supabase/sql/20261102-shop_place_order-规格图片修复.sql
-- 日期：2026-11-02
--
-- 症状（测试号实测复现）：规格带图的商品下单，RPC 直接报
--   42883 operator does not exist: text ->> integer
-- 根因：定义里 `v->>'images'->>0` —— v->>'images' 已经把 jsonb 取成 text，
--       再对 text 用整型下标 ->> 0 没有这个运算符。
-- 修法：只改这一个表达式为 `v -> 'images' ->> 0`（先按整型下标取 jsonb，再取文本）。
-- 底本：g12 结构迁移里的现行线上定义（SY- 订单号走 shop_next_order_no()），
--       其余逻辑一字未动。幂等可重复执行。
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.shop_place_order(p_items jsonb, p_address jsonb, p_note text DEFAULT ''::text, p_coupon text DEFAULT ''::text, p_group_id uuid DEFAULT NULL::uuid, p_client_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_email text := coalesce(nullif(btrim(coalesce(current_setting('request.jwt.claims', true), '')), '')::jsonb->>'email', current_setting('request.jwt.claim.email', true), '');
  it jsonb; r record; v_sku text; v_qty int; v_price numeric; v_name text; v_image text; v_weight numeric := 0;
  snap jsonb := '[]'::jsonb; v_subtotal numeric := 0;
  v_ship jsonb; v_est numeric := 0; v_fee numeric := 2;
  v_disc numeric := 0; v_coupon record; v_total numeric;
  v_oid uuid; v_ono text; v_g record;
  v_zi int := 1; v_addlbs int;
begin
  if v_uid is null then raise exception '请先登录'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception '购物车是空的'; end if;
  if coalesce(p_address->>'name','') = '' or coalesce(p_address->>'street','') = '' then
    raise exception '收货地址不完整'; end if;

  select value into v_ship from public.site_settings where key = 'shop_ship';
  if v_ship is not null then
    v_fee = coalesce((v_ship->>'service_fee')::numeric, 2);
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty = coalesce((it->>'qty')::int, 0);
    v_sku = coalesce(it->>'sku','');
    if v_qty < 1 then raise exception '数量不对'; end if;
    select * into r from public.products where id = (it->>'id')::uuid;
    if r.id is null or r.sold then raise exception '商品已下架'; end if;
    if v_sku = '' and r.variants is not null and jsonb_array_length(r.variants) > 0 then
      raise exception '请选择规格'; end if;
    if v_sku = '' then
      if coalesce(r.stock,0) < v_qty then raise exception '「%」库存不够了', r.name; end if;
      v_price = r.price::numeric; v_name = r.name; v_image = coalesce(r.image_url,'');
      update public.products set stock = coalesce(stock,0) - v_qty where id = r.id;
      v_weight = v_weight + coalesce(r.weight_oz,0) * v_qty;
    else
      declare v jsonb; found boolean := false; arr jsonb := '[]'::jsonb; i int;
      begin
        if r.variants is null then raise exception '商品没有这个规格'; end if;
        for i in 0 .. jsonb_array_length(r.variants) - 1 loop
          v = r.variants->i;
          if v->>'sku' = v_sku then
            found = true;
            if coalesce((v->>'stock')::int,0) < v_qty then
              raise exception '「% · %」库存不够了', r.name, coalesce(v->>'name', v_sku);
            end if;
            v_price = (v->>'price')::numeric; v_name = r.name || ' · ' || coalesce(v->>'name', v_sku);
                        v_image = coalesce(v -> 'images' ->> 0, r.image_url); -- 20261102 修复：v->>'images' 已是 text，再 ->> 0 会报 text->>integer；先 -> 取 jsonb 再取文本
            v = jsonb_set(v, '{stock}', (coalesce((v->>'stock')::int,0) - v_qty)::text::jsonb);
            v_weight = v_weight + coalesce(r.weight_oz,0) * v_qty;
          end if;
          arr = arr || v;
        end loop;
        if not found then raise exception '规格不存在或已下架'; end if;
        update public.products set variants = arr where id = r.id;
      end;
    end if;
    snap = snap || jsonb_build_object('id', r.id, 'name', v_name, 'image', v_image,
      'sku', v_sku, 'price', v_price, 'qty', v_qty, 'weight_oz', coalesce(r.weight_oz,0));
    v_subtotal = v_subtotal + v_price * v_qty;
  end loop;

  if coalesce(p_address->>'zip','') <> '' then
    v_zi := case left(p_address->>'zip',1)
      when '9' then 1 when '8' then 2 when '7' then 3 when '6' then 4
      when '5' then 5 when '4' then 6 when '3' then 7 else 8 end;
    v_weight := least(greatest(coalesce(v_weight,0), 1), 70*16);
    if v_weight <= 4 then
      v_est := (array[4.15,4.35,4.60,4.85,5.15,5.45,5.75,6.15])[v_zi];
    elsif v_weight <= 8 then
      v_est := (array[4.60,4.90,5.25,5.60,6.00,6.45,6.90,7.45])[v_zi];
    elsif v_weight <= 12 then
      v_est := (array[5.00,5.40,5.90,6.45,7.00,7.60,8.15,8.85])[v_zi];
    elsif v_weight <= 16 then
      v_est := (array[5.40,5.95,6.55,7.25,8.05,8.80,9.50,10.30])[v_zi];
    else
      v_addlbs := ceil((v_weight - 16)/16);
      v_est := (array[5.40,5.95,6.55,7.25,8.05,8.80,9.50,10.30])[v_zi]
        + v_addlbs * (array[0.55,0.70,0.90,1.10,1.35,1.55,1.80,2.05])[v_zi];
    end if;
    v_est := round(v_est, 2);
  end if;

  if coalesce(p_coupon,'') <> '' then
    select * into v_coupon from public.shop_coupons where code = p_coupon and active;
    if v_coupon is null then raise exception '优惠码无效'; end if;
    if v_coupon.starts_at is not null and now() < v_coupon.starts_at then raise exception '优惠活动还没开始'; end if;
    if v_coupon.ends_at is not null and now() > v_coupon.ends_at then raise exception '优惠券已过期'; end if;
    if v_coupon.max_uses > 0 and v_coupon.used >= v_coupon.max_uses then raise exception '这个优惠码你已经用过了'; end if;
    if v_coupon.per_user > 0 and (select count(*) from public.shop_coupon_uses u where u.coupon_id = v_coupon.id and u.user_id = v_uid) >= v_coupon.per_user then
      raise exception '这个优惠码你已经用过了'; end if;
    if v_subtotal < v_coupon.min_spend then raise exception '没到优惠码的满减门槛'; end if;
    if v_coupon.tag <> '' and not exists (
      select 1 from jsonb_array_elements(snap) s
      join public.products pp on pp.id = (s->>'id')::uuid
      where pp.tag = v_coupon.tag) then
      raise exception '优惠码只适用于「%」商品', v_coupon.tag; end if;
    if v_coupon.type = 'percent' then v_disc = round(v_subtotal * v_coupon.value / 100, 2);
    else v_disc = least(v_coupon.value, v_subtotal); end if;
  end if;

  if p_group_id is not null then
    select * into v_g from public.shop_groups where id = p_group_id for update;
    if v_g is null then raise exception '拼团不存在'; end if;
    if v_g.status <> 'open' then raise exception '拼团已结束'; end if;
    if v_g.deadline < now() then raise exception '拼团已过期'; end if;
    if v_g.joined >= v_g.target then raise exception '拼团人数已满'; end if;
    if exists (select 1 from public.shop_group_members m where m.group_id = p_group_id and m.user_id = v_uid) then
      raise exception '你已经在这个拼团里啦'; end if;
    if jsonb_array_length(snap) = 1 then
      v_subtotal = v_g.price;
    end if;
  end if;

  v_total = v_subtotal - v_disc + v_est + v_fee;
  v_ono = public.shop_next_order_no();

  insert into public.shop_orders (order_no, user_id, email, items, subtotal, discount, coupon_code,
      shipping_est, service_fee, total, status, address, note, group_id, client_token)
  values (v_ono, v_uid, v_email, snap, v_subtotal, v_disc, coalesce(p_coupon,''),
      v_est, v_fee, v_total, 'pending', p_address, coalesce(p_note,''), p_group_id, p_client_token)
  returning id into v_oid;

  if p_group_id is not null then
    insert into public.shop_group_members (group_id, user_id, nickname, order_id)
    values (p_group_id, v_uid, coalesce((select nickname from public.shop_profiles where id = v_uid), split_part(v_email,'@',1)), v_oid);
    update public.shop_groups set joined = joined + 1 where id = p_group_id;
  end if;

  if v_coupon is not null then
    insert into public.shop_coupon_uses (coupon_id, user_id, order_id) values (v_coupon.id, v_uid, v_oid);
    update public.shop_coupons set used = used + 1 where id = v_coupon.id;
  end if;

  insert into public.shop_order_logs (order_id, actor, action, detail)
  values (v_oid, 'buyer', 'create', '下单 ' || v_ono);

  return jsonb_build_object('order_id', v_oid, 'order_no', v_ono, 'total', v_total,
    'subtotal', v_subtotal, 'discount', v_disc, 'shipping_est', v_est, 'service_fee', v_fee);
end $function$

-- 权限保持原样（authenticated 可下单）
grant execute on function public.shop_place_order(jsonb, jsonb, text, text, uuid, text) to authenticated;

-- 自检：跑完看一眼结果，expected = true 即生效
select (position('v -> ''images'' ->> 0' in pg_get_functiondef(p.oid)) > 0
        and position('v->>''images''->>0' in pg_get_functiondef(p.oid)) = 0)::text as expected
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'shop_place_order';
