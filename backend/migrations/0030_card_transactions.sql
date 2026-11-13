-- Card payments over SumUp (#155): the desk charges the cart through the SumUp SDK and
-- books the sale afterwards. The sale keeps how it was paid and SumUp's transaction code,
-- so the team can find the payment in SumUp, e.g. to refund an item that could not be
-- booked (sale_conflicts). The method is on the purchases too (0029); a sale whose items
-- all became conflicts has no purchase, so the desk sale needs its own copy.

ALTER TABLE desk_sales
  ADD COLUMN payment_method payment_method NOT NULL DEFAULT 'cash',
  ADD COLUMN card_transaction_code text;

-- Sales from before this migration: the method their purchases were booked with
UPDATE desk_sales d SET payment_method = 'card'
WHERE EXISTS (SELECT 1 FROM purchases p WHERE p.desk_sale_id = d.id AND p.payment_method = 'card');
