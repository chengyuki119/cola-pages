-- What To Eat Today: standalone options table; does not modify Foodie restaurant data.
CREATE TABLE IF NOT EXISTS public.food_wheel_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (btrim(name) <> ''),
  category text NOT NULL CHECK (category IN ('chinese','japanese','korean','american','fast_food','dessert','drink','other')),
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS food_wheel_options_name_category_uq
  ON public.food_wheel_options (lower(name), category);
CREATE INDEX IF NOT EXISTS food_wheel_options_enabled_sort_idx
  ON public.food_wheel_options (enabled, sort_order, name);

ALTER TABLE public.food_wheel_options ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.food_wheel_options FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.food_wheel_options TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.food_wheel_options TO authenticated;

DROP POLICY IF EXISTS food_wheel_options_public_enabled_read ON public.food_wheel_options;
CREATE POLICY food_wheel_options_public_enabled_read
  ON public.food_wheel_options FOR SELECT TO anon, authenticated
  USING (enabled IS TRUE);

DROP POLICY IF EXISTS food_wheel_options_admin_read ON public.food_wheel_options;
CREATE POLICY food_wheel_options_admin_read
  ON public.food_wheel_options FOR SELECT TO authenticated
  USING (public.shop_is_admin());

DROP POLICY IF EXISTS food_wheel_options_admin_insert ON public.food_wheel_options;
CREATE POLICY food_wheel_options_admin_insert
  ON public.food_wheel_options FOR INSERT TO authenticated
  WITH CHECK (public.shop_is_admin());

DROP POLICY IF EXISTS food_wheel_options_admin_update ON public.food_wheel_options;
CREATE POLICY food_wheel_options_admin_update
  ON public.food_wheel_options FOR UPDATE TO authenticated
  USING (public.shop_is_admin())
  WITH CHECK (public.shop_is_admin());

DROP POLICY IF EXISTS food_wheel_options_admin_delete ON public.food_wheel_options;
CREATE POLICY food_wheel_options_admin_delete
  ON public.food_wheel_options FOR DELETE TO authenticated
  USING (public.shop_is_admin());

INSERT INTO public.food_wheel_options (name, category, sort_order) VALUES
  ('火锅', 'chinese', 10),
  ('寿司', 'japanese', 20),
  ('韩式拌饭', 'korean', 30),
  ('烤肋排', 'american', 40),
  ('汉堡', 'fast_food', 50),
  ('冰淇淋', 'dessert', 60),
  ('奶茶', 'drink', 70),
  ('随便吃点', 'other', 80)
ON CONFLICT DO NOTHING;
