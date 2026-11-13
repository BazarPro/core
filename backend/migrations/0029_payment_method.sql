-- How the buyer paid at the cash desk (#155). A card payment goes to the organizer's
-- account, not into the cash box, so the cash summary leaves it out of the cash on hand.
-- The desk says which it was; the terminal is the organizer's own, outside BazarPro.

CREATE TYPE payment_method AS ENUM ('cash', 'card');

ALTER TABLE purchases
  ADD COLUMN payment_method payment_method NOT NULL DEFAULT 'cash';
