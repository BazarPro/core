import { afterEach, describe, expect, test } from 'vitest';
import i18n from '../i18n';
import { ApiError } from './api/client';
import { getUserFacingErrorMessage } from './errors';

afterEach(async () => {
  await i18n.changeLanguage('de');
});

describe('errors from the backend', () => {
  test('codes are shown in the language of the app, with their values', async () => {
    const error = new ApiError(400, {
      code: 'checkout.tooMany',
      params: { max: 50 },
      message: 'Höchstens 50 Artikel pro Verkauf.',
    });
    expect(getUserFacingErrorMessage(error)).toBe('Höchstens 50 Artikel pro Verkauf.');
    await i18n.changeLanguage('en');
    expect(getUserFacingErrorMessage(error)).toBe('At most 50 items per sale.');
  });

  test('a failed cart item names the item and the reason', async () => {
    const error = new ApiError(400, {
      code: 'checkout.itemFailed',
      params: { title: 'Jacke' },
      message: '„Jacke“: Dieser Artikel ist bereits verkauft.',
      cause: { code: 'product.alreadySold' },
    });
    expect(getUserFacingErrorMessage(error)).toBe('„Jacke“: Dieser Artikel ist bereits verkauft.');
    await i18n.changeLanguage('en');
    expect(getUserFacingErrorMessage(error)).toBe('“Jacke”: This item is already sold.');
  });

  test('unknown codes, message maps and the fallback', async () => {
    const organizer = new ApiError(400, {
      code: 'ACCOUNT_IS_ORGANIZER',
      message: 'Konto ist Organisator',
    });
    expect(getUserFacingErrorMessage(organizer)).toBe('Konto ist Organisator');
    expect(
      getUserFacingErrorMessage(organizer, { messageMap: { ACCOUNT_IS_ORGANIZER: 'Organisator' } })
    ).toBe('Organisator');
    expect(getUserFacingErrorMessage(new Error('Alter Text'))).toBe('Alter Text');
    expect(getUserFacingErrorMessage(new Error(''))).toBe(
      'Ein unbekannter Fehler ist aufgetreten.'
    );
    await i18n.changeLanguage('en');
    expect(getUserFacingErrorMessage(new Error(''))).toBe('An unknown error occurred.');
  });
});
