-- 小铺库存 / 成本 / 状态标签 设置
-- 在 Supabase → SQL Editor 里整段粘贴运行，跑一次就行

-- 1. 新增三个字段
alter table public.products add column if not exists stock int default 1;          -- 库存：0 就是售尽
alter table public.products add column if not exists cost numeric;                 -- 成本：只有你自己能看到
alter table public.products add column if not exists display_only boolean not null default false; -- 仅展示

-- 2. 之前标过「已售出」的商品，库存自动设为 0（变成售尽）
update public.products set stock = 0 where sold = true and (stock is null or stock > 0);

-- 3. 成本保密：游客（anon）只能读指定列，读不到 cost
--    你登录后台用的是 authenticated 身份，不受影响，照样能看到成本
revoke select on public.products from anon;
grant select (id, name, price, description, tag, image_url, sold, stock, display_only, created_at)
  on public.products to anon;
