import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import i18n from '../i18n';

// Tests read the German texts, whatever language the test browser reports
beforeEach(async () => {
  if (i18n.language !== 'de') await i18n.changeLanguage('de');
});

// Testing Library only auto-cleans when Vitest globals are enabled
afterEach(() => {
  cleanup();
});
