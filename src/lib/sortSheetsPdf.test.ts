import { describe, expect, it } from 'vitest';
import { buildSortSheetsPdf } from './sortSheetsPdf';

const NOTE = 'Achte auf den Buchstaben';

describe('sort sheets', () => {
  it('prints two sheets per page, one for each basket', () => {
    const sellers = [1, 2, 3].map((n) => ({ sortCode: n, name: `Verkäufer ${n}` }));
    expect(buildSortSheetsPdf(sellers).getNumberOfPages()).toBe(2);
  });

  it('warns on a single basket label about a look-alike basket of the bazaar', () => {
    const seller = { sortCode: 66_647, name: 'Anna' };
    expect(buildSortSheetsPdf([seller], NOTE).output()).not.toContain(NOTE);
    expect(buildSortSheetsPdf([seller], NOTE, [66_647, 166_647]).output()).toContain(NOTE);
  });
});
