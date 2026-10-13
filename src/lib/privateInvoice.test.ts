import { describe, expect, it } from 'vitest';
import { invoicePriceFor } from './privateInvoice';

const base = { title: 'Rad', description: '', price: 200 };

describe('invoicePriceFor', () => {
  it('uses the negotiated price instead of label and discount', () => {
    expect(invoicePriceFor({ ...base, discountPercent: 10, salePrice: 150 })).toEqual({
      ...base,
      price: 150,
      discountPercent: undefined,
    });
  });

  it('keeps label and discount when the item sold at the list price', () => {
    expect(invoicePriceFor({ ...base, discountPercent: 10, salePrice: 180 })).toEqual({
      ...base,
      discountPercent: 10,
    });
    expect(invoicePriceFor({ ...base, salePrice: undefined })).toEqual(base);
  });
});
