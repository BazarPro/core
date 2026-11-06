import { describe, expect, it, vi } from 'vitest';
import { SORT_PATTERNS } from '../shared/sortCode';
import { savePdf } from './saveFile';
import { buildSortSheetsPdf, downloadBasketLabel, downloadSortSheets } from './sortSheetsPdf';

vi.mock('./saveFile', () => ({ savePdf: vi.fn() }));

const NOTE = 'Achte auf den Zusatzbuchstaben';

describe('sort sheets', () => {
  it('prints two sheets per page, one for each basket', () => {
    const sellers = [1, 2, 3].map((n) => ({ sortCode: n, name: `Verkäufer ${n}` }));
    expect(buildSortSheetsPdf(sellers).getNumberOfPages()).toBe(2);
  });

  it('downloads all sheets or the label of one basket', async () => {
    const seller = { sortCode: 66_647, name: 'Anna' };
    await downloadSortSheets([seller], NOTE);
    expect(savePdf).toHaveBeenLastCalledWith(expect.anything(), 'BazarPro-Sortierblaetter.pdf');
    await downloadBasketLabel(seller);
    expect(savePdf).toHaveBeenLastCalledWith(expect.anything(), 'BazarPro-Korb-Etikett.pdf');
  });

  it('warns on a single basket label about a look-alike basket of the bazaar', () => {
    const seller = { sortCode: 66_647, name: 'Anna' };
    expect(buildSortSheetsPdf([seller], NOTE).output()).not.toContain(NOTE);
    expect(buildSortSheetsPdf([seller], NOTE, [66_647, SORT_PATTERNS + 66_647]).output()).toContain(
      NOTE
    );
  });
});
