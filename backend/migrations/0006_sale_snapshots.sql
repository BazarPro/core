-- What a settlement needs is kept with the sale and the seller row (#167), so it no longer
-- depends on the product and the profile: both may change or be deleted later (#53).

ALTER TABLE purchases
  ADD COLUMN product_title text,
  ADD COLUMN category_id uuid REFERENCES categories (id) ON DELETE SET NULL,
  ADD COLUMN category_label text,
  -- Category specific fields of the product at the sale, e.g. the frame number
  ADD COLUMN product_attributes jsonb,
  ADD COLUMN seller_number integer,
  ALTER COLUMN product_id DROP NOT NULL,
  DROP CONSTRAINT purchases_product_id_fkey,
  ADD CONSTRAINT purchases_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL;

COMMENT ON COLUMN event_sellers.seller_snapshot IS
  'Name, address and contact of the seller: at the first registered item with fixedSellerData '
  '(then fixed), otherwise at intake or the first sale and again at the payout.';

-- Backfill; the same as seller_records::backfill_snapshots, which the Convex import runs.
-- Sellers of sales without a seller row get one, so the settlement finds them.
INSERT INTO event_sellers (event_id, user_id, total_fee, commission_fee, payout_amount, payout_received)
SELECT DISTINCT event_id, seller_id, 0, 0, 0, false FROM purchases
ON CONFLICT (event_id, user_id) DO NOTHING;

UPDATE purchases pu
SET product_title = p.title, category_id = p.category_id, category_label = c.label,
    product_attributes = p.attributes
FROM products p LEFT JOIN categories c ON c.id = p.category_id
WHERE p.id = pu.product_id AND pu.product_title IS NULL;

UPDATE purchases pu SET seller_number = s.number
FROM event_sellers s
WHERE s.event_id = pu.event_id AND s.user_id = pu.seller_id AND pu.seller_number IS NULL;

UPDATE event_sellers s
SET seller_snapshot = jsonb_strip_nulls(jsonb_build_object(
  'name', u.name, 'firstName', u.first_name, 'lastName', u.last_name, 'street', u.street,
  'zipCode', u.zip_code, 'city', u.city, 'country', u.country, 'phone', u.phone,
  'email', COALESCE(u.email, u.contact_email),
  'takenAt', floor(extract(epoch FROM now()) * 1000)::bigint))
FROM users u
WHERE u.id = s.user_id AND s.seller_snapshot IS NULL;
