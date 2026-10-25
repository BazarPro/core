-- Sales of a cash desk that worked offline: the app keeps them in a queue and books them
-- once it is online again. The ID comes from the app, so a sale sent twice (a lost reply,
-- two flushes at once) is booked once. Online carts use it too, so a retry after a timeout
-- does not sell twice.

CREATE TABLE desk_sales (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  -- The team member at the cash desk
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  -- When the buyer paid; for an offline sale earlier than created_at
  sold_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE purchases
  ADD COLUMN desk_sale_id uuid REFERENCES desk_sales (id) ON DELETE SET NULL;
CREATE INDEX purchases_desk_sale_idx ON purchases (desk_sale_id);

-- Items of an offline sale that could not be booked: sold at another desk meanwhile,
-- removed from the bazaar or the seller already paid out. The money is in the till, so the
-- team settles it by hand and marks the conflict as resolved.
CREATE TABLE sale_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  desk_sale_id uuid NOT NULL REFERENCES desk_sales (id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  product_id uuid REFERENCES products (id) ON DELETE SET NULL,
  -- Title at the sale, also when the product is deleted later
  title text NOT NULL,
  amount numeric(12, 2) NOT NULL,
  -- Error code, e.g. product.notForSale or seller.paidOutNoSales
  reason text NOT NULL,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sale_conflicts_event_idx ON sale_conflicts (event_id);
