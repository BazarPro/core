import { afterEach, describe, expect, test } from 'vitest';
import { ConvexError } from 'convex/values';
import i18n from '../i18n';
import { appError } from '../../convex/errors';
import { getUserFacingErrorMessage } from './errors';

afterEach(async () => {
  await i18n.changeLanguage('de');
});

describe('errors from the backend', () => {
  test('codes are shown in the language of the app, with their values', async () => {
    const error = appError('checkout.tooMany', { max: 50 });
    expect(getUserFacingErrorMessage(error)).toBe('Höchstens 50 Artikel pro Verkauf.');
    await i18n.changeLanguage('en');
    expect(getUserFacingErrorMessage(error)).toBe('At most 50 items per sale.');
  });

  test('a failed cart item names the item and the reason', async () => {
    const error = appError(
      'checkout.itemFailed',
      { title: 'Jacke' },
      appError('product.alreadySold').data
    );
    expect(getUserFacingErrorMessage(error)).toBe('„Jacke“: Dieser Artikel ist bereits verkauft.');
    expect(error.data.message).toBe('„Jacke“: Dieser Artikel ist bereits verkauft.');
    await i18n.changeLanguage('en');
    expect(getUserFacingErrorMessage(error)).toBe('“Jacke”: This item is already sold.');
  });

  test('plain texts, message maps and the fallback still work', async () => {
    expect(getUserFacingErrorMessage(new ConvexError('Alter Text'))).toBe('Alter Text');
    expect(
      getUserFacingErrorMessage(new ConvexError('ACCOUNT_IS_ORGANIZER'), {
        messageMap: { ACCOUNT_IS_ORGANIZER: 'Organisator' },
      })
    ).toBe('Organisator');
    expect(getUserFacingErrorMessage(new ConvexError(''))).toBe(
      'Ein unbekannter Fehler ist aufgetreten.'
    );
    await i18n.changeLanguage('en');
    expect(getUserFacingErrorMessage(new ConvexError(''))).toBe('An unknown error occurred.');
  });
});
