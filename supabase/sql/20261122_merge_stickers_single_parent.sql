-- Snow Yuzu: merge the 11 existing transfer-sticker series into one public product.
-- Existing product IDs, variants, SKU, stock, images, and costs are snapshotted first.
-- Only the Sanrio parent ID is retained as the canonical parent ID; order snapshots are
-- JSON snapshots and are not rewritten. This migration aborts if linked orders/carts or
-- related rows exist, so it cannot silently detach live records.

CREATE TABLE IF NOT EXISTS public.shop_sticker_merge_backup (
  run_key text PRIMARY KEY,
  products_snapshot jsonb NOT NULL,
  costs_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.shop_sticker_merge_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shop_sticker_merge_backup FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.shop_sticker_merge_backup TO service_role;

CREATE TABLE IF NOT EXISTS public.shop_variant_private_notes (
  variant_sku text PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  series text NOT NULL,
  original_parent_name text NOT NULL,
  original_variant_label text NOT NULL,
  source_shop_name text,
  source_product_code text,
  source_product_name text,
  source_match_status text NOT NULL DEFAULT 'pending'
    CHECK (source_match_status IN ('pending', 'verified')),
  merge_key text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shop_variant_private_notes_product_idx
  ON public.shop_variant_private_notes(product_id, series, variant_sku);
ALTER TABLE public.shop_variant_private_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shop_variant_private_notes FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_variant_private_notes TO authenticated;
DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shop_variant_private_notes'
      AND policyname = 'admin manage sticker private notes'
  ) THEN
    CREATE POLICY "admin manage sticker private notes"
      ON public.shop_variant_private_notes
      FOR ALL TO authenticated
      USING (public.shop_is_admin_sd())
      WITH CHECK (public.shop_is_admin_sd());
  END IF;
END
$policy$;

DO $merge$
DECLARE
  v_canonical_id uuid;
  v_parent_count integer;
  v_variant_count integer;
  v_cost_count integer;
  v_updated_cost_count integer;
  v_link_count integer;
  v_new_variants jsonb;
  v_first_image text;
  v_run_key constant text := 'sticker-series-merge-20261122';
BEGIN
  -- Safe repeat: an already-completed run is a no-op only when the final shape is intact.
  IF EXISTS (SELECT 1 FROM public.shop_sticker_merge_backup WHERE run_key = v_run_key) THEN
    IF (SELECT count(*) FROM public.products WHERE name = '贴纸' AND category = '转印贴' AND tag = '转印贴') = 1
       AND (SELECT jsonb_array_length(variants) FROM public.products WHERE name = '贴纸' AND category = '转印贴' AND tag = '转印贴') = 100
       AND (SELECT count(*) FROM public.shop_variant_private_notes WHERE merge_key = v_run_key) = 100 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Merge backup exists but the final product shape is inconsistent; stop for manual review.';
  END IF;

  SELECT id INTO v_canonical_id
  FROM public.products
  WHERE name = '三丽鸥转印贴' AND category = '转印贴';
  IF v_canonical_id IS NULL THEN
    RAISE EXCEPTION 'Expected the existing Sanrio sticker parent was not found.';
  END IF;

  SELECT count(*) INTO v_parent_count
  FROM public.products WHERE category = '转印贴';
  IF v_parent_count <> 11 THEN
    RAISE EXCEPTION 'Expected exactly 11 sticker parents; found %.', v_parent_count;
  END IF;
  IF EXISTS (SELECT 1 FROM public.products WHERE name = '贴纸' AND id <> v_canonical_id) THEN
    RAISE EXCEPTION 'A separate product named 贴纸 already exists; refusing to merge into a duplicate.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.category = '转印贴'
      AND (p.name NOT IN ('Mikko转印贴','三丽鸥转印贴','兔丸转印贴','其他转印贴','吉伊卡哇转印贴','哆啦A梦转印贴','暴力熊转印贴','瓦罗兰特转印贴','装饰品转印贴','角落生物转印贴','轻松熊转印贴')
        OR jsonb_typeof(p.variants) IS DISTINCT FROM 'array')
  ) THEN
    RAISE EXCEPTION 'Unexpected sticker parent or malformed variants JSON; refusing to guess the series mapping.';
  END IF;

  SELECT count(*) INTO v_variant_count
  FROM public.products p
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(p.variants) = 'array' THEN p.variants ELSE '[]'::jsonb END
  ) AS x(value)
  WHERE p.category = '转印贴';
  IF v_variant_count <> 100 THEN
    RAISE EXCEPTION 'Expected exactly 100 variants; found %.', v_variant_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.products p
    CROSS JOIN LATERAL jsonb_array_elements(p.variants) AS x(value)
    WHERE p.category = '转印贴'
      AND (coalesce(nullif(btrim(x.value->>'sku'), ''), '') = ''
        OR coalesce(nullif(btrim(x.value->>'name'), ''), '') = ''
        OR jsonb_typeof(x.value->'images') IS DISTINCT FROM 'array'
        OR jsonb_array_length(CASE WHEN jsonb_typeof(x.value->'images')='array' THEN x.value->'images' ELSE '[]'::jsonb END) = 0)
  ) THEN
    RAISE EXCEPTION 'A sticker variant is missing SKU, original label, or image; refusing to continue.';
  END IF;

  IF EXISTS (
    SELECT x.value->>'sku' FROM public.products p
    CROSS JOIN LATERAL jsonb_array_elements(p.variants) AS x(value)
    WHERE p.category = '转印贴'
    GROUP BY x.value->>'sku' HAVING count(*) <> 1
  ) THEN
    RAISE EXCEPTION 'Duplicate sticker variant SKU found; refusing to continue.';
  END IF;

  SELECT count(*) INTO v_cost_count
  FROM public.shop_variant_costs c
  JOIN public.products p ON p.id = c.product_id
  WHERE p.category = '转印贴';
  IF v_cost_count <> 100 OR EXISTS (
    SELECT 1 FROM public.products p
    CROSS JOIN LATERAL jsonb_array_elements(p.variants) AS x(value)
    LEFT JOIN public.shop_variant_costs c
      ON c.product_id = p.id AND c.variant_sku = x.value->>'sku'
    WHERE p.category = '转印贴' AND c.variant_sku IS NULL
  ) THEN
    RAISE EXCEPTION 'The 100 variants do not have exactly matching private cost records; refusing to continue.';
  END IF;

  -- Existing order snapshots are self-contained, but do not delete/rekey any product if
  -- an order or cart currently refers to a sticker SKU.
  IF EXISTS (
    SELECT 1 FROM public.shop_orders o
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(o.items)='array' THEN o.items ELSE '[]'::jsonb END
    ) AS i(value)
    WHERE i.value->>'sku' IN (
      SELECT x.value->>'sku' FROM public.products p
      CROSS JOIN LATERAL jsonb_array_elements(p.variants) AS x(value)
      WHERE p.category='转印贴'
    )
  ) THEN
    RAISE EXCEPTION 'Sticker SKU order snapshots exist; preserve all original parent rows and review manually.';
  END IF;
  IF to_regclass('public.shop_carts') IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.shop_carts c
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(c.items)='array' THEN c.items ELSE '[]'::jsonb END
    ) AS i(value)
    WHERE i.value->>'sku' IN (
      SELECT x.value->>'sku' FROM public.products p
      CROSS JOIN LATERAL jsonb_array_elements(p.variants) AS x(value)
      WHERE p.category='转印贴'
    )
  ) THEN
    RAISE EXCEPTION 'Sticker items exist in carts; preserve the old parent IDs and review cart migration first.';
  END IF;

  SELECT count(*) INTO v_link_count FROM public.shop_favorites WHERE product_id IN (SELECT id FROM public.products WHERE category='转印贴');
  IF v_link_count <> 0 THEN RAISE EXCEPTION 'Sticker favorites exist; refusing to cascade-delete those references.'; END IF;
  SELECT count(*) INTO v_link_count FROM public.shop_groups WHERE product_id IN (SELECT id FROM public.products WHERE category='转印贴');
  IF v_link_count <> 0 THEN RAISE EXCEPTION 'Sticker group-buy records exist; refusing to detach them.'; END IF;
  SELECT count(*) INTO v_link_count FROM public.shop_product_units WHERE product_id IN (SELECT id FROM public.products WHERE category='转印贴');
  IF v_link_count <> 0 THEN RAISE EXCEPTION 'Sticker unit tracking records exist; refusing to detach them.'; END IF;

  -- Durable, private server-side recovery snapshot before the first data change.
  INSERT INTO public.shop_sticker_merge_backup (run_key, products_snapshot, costs_snapshot)
  SELECT v_run_key,
         (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.name) FROM public.products p WHERE p.category='转印贴'),
         (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.variant_sku)
          FROM public.shop_variant_costs c
          JOIN public.products p ON p.id=c.product_id
          WHERE p.category='转印贴');

  -- Series names are based only on the existing, explicit parent groups; in-series
  -- numbering follows the current stable order of variants in each parent JSON array.
  WITH source AS (
    SELECT p.id AS parent_id, p.name AS parent_name, x.value AS variant, x.ordinality,
      CASE p.name
        WHEN '三丽鸥转印贴' THEN '三丽鸥'
        WHEN '瓦罗兰特转印贴' THEN '瓦罗兰特'
        WHEN 'Mikko转印贴' THEN 'Mikko'
        WHEN '装饰品转印贴' THEN '装饰品'
        WHEN '其他转印贴' THEN '其他转印贴'
        WHEN '轻松熊转印贴' THEN '轻松熊'
        WHEN '角落生物转印贴' THEN '角落生物'
        WHEN '暴力熊转印贴' THEN '暴力熊'
        WHEN '吉伊卡哇转印贴' THEN '吉伊卡哇'
        WHEN '哆啦A梦转印贴' THEN '哆啦A梦'
        WHEN '兔丸转印贴' THEN '兔丸'
      END AS series,
      CASE p.name
        WHEN '三丽鸥转印贴' THEN 1 WHEN '瓦罗兰特转印贴' THEN 2
        WHEN 'Mikko转印贴' THEN 3 WHEN '装饰品转印贴' THEN 4
        WHEN '其他转印贴' THEN 5 WHEN '轻松熊转印贴' THEN 6
        WHEN '角落生物转印贴' THEN 7 WHEN '暴力熊转印贴' THEN 8
        WHEN '吉伊卡哇转印贴' THEN 9 WHEN '哆啦A梦转印贴' THEN 10
        WHEN '兔丸转印贴' THEN 11
      END AS series_order
    FROM public.products p
    CROSS JOIN LATERAL jsonb_array_elements(p.variants) WITH ORDINALITY AS x(value, ordinality)
    WHERE p.category='转印贴'
  ), numbered AS (
    SELECT *, row_number() OVER (PARTITION BY series ORDER BY ordinality)::integer AS series_number
    FROM source
  )
  INSERT INTO public.shop_variant_private_notes (
    variant_sku, product_id, series, original_parent_name, original_variant_label,
    source_shop_name, source_product_code, source_product_name, source_match_status, merge_key
  )
  SELECT variant->>'sku', v_canonical_id, series, parent_name, variant->>'name',
         NULL, NULL, NULL, 'pending', v_run_key
  FROM numbered;

  WITH source AS (
    SELECT p.name AS parent_name, x.value AS variant, x.ordinality,
      CASE p.name
        WHEN '三丽鸥转印贴' THEN '三丽鸥' WHEN '瓦罗兰特转印贴' THEN '瓦罗兰特'
        WHEN 'Mikko转印贴' THEN 'Mikko' WHEN '装饰品转印贴' THEN '装饰品'
        WHEN '其他转印贴' THEN '其他转印贴' WHEN '轻松熊转印贴' THEN '轻松熊'
        WHEN '角落生物转印贴' THEN '角落生物' WHEN '暴力熊转印贴' THEN '暴力熊'
        WHEN '吉伊卡哇转印贴' THEN '吉伊卡哇' WHEN '哆啦A梦转印贴' THEN '哆啦A梦'
        WHEN '兔丸转印贴' THEN '兔丸'
      END AS series,
      CASE p.name
        WHEN '三丽鸥转印贴' THEN 1 WHEN '瓦罗兰特转印贴' THEN 2
        WHEN 'Mikko转印贴' THEN 3 WHEN '装饰品转印贴' THEN 4
        WHEN '其他转印贴' THEN 5 WHEN '轻松熊转印贴' THEN 6
        WHEN '角落生物转印贴' THEN 7 WHEN '暴力熊转印贴' THEN 8
        WHEN '吉伊卡哇转印贴' THEN 9 WHEN '哆啦A梦转印贴' THEN 10
        WHEN '兔丸转印贴' THEN 11
      END AS series_order
    FROM public.products p
    CROSS JOIN LATERAL jsonb_array_elements(p.variants) WITH ORDINALITY AS x(value, ordinality)
    WHERE p.category='转印贴'
  ), numbered AS (
    SELECT *, row_number() OVER (PARTITION BY series ORDER BY ordinality)::integer AS series_number
    FROM source
  )
  SELECT jsonb_agg(
    variant || jsonb_build_object('name', series || series_number::text, 'series', series)
    ORDER BY series_order, series_number
  ) INTO v_new_variants
  FROM numbered;

  UPDATE public.shop_variant_costs c
  SET product_id = v_canonical_id
  FROM public.products p
  WHERE p.category='转印贴' AND p.id<>v_canonical_id AND c.product_id=p.id;
  GET DIAGNOSTICS v_updated_cost_count = ROW_COUNT;
  IF v_updated_cost_count <> 76 THEN
    RAISE EXCEPTION 'Expected to re-associate 76 non-canonical cost rows; updated %.', v_updated_cost_count;
  END IF;

  v_first_image := v_new_variants->0->'images'->>0;
  UPDATE public.products
  SET name='贴纸', name_en='Stickers', tag='转印贴', category='转印贴', price='0',
      currency='USD', stock=0, sold=false, sku=NULL, variants=v_new_variants,
      image_url=coalesce(v_first_image, image_url)
  WHERE id=v_canonical_id;

  DELETE FROM public.products WHERE category='转印贴' AND id<>v_canonical_id;

  IF (SELECT count(*) FROM public.products WHERE category='转印贴') <> 1
     OR (SELECT jsonb_array_length(variants) FROM public.products WHERE id=v_canonical_id) <> 100
     OR (SELECT count(*) FROM public.shop_variant_private_notes WHERE merge_key=v_run_key) <> 100
     OR (SELECT count(*) FROM public.shop_variant_costs WHERE product_id=v_canonical_id) <> 100 THEN
    RAISE EXCEPTION 'Post-merge validation failed; transaction must roll back.';
  END IF;
END
$merge$;
