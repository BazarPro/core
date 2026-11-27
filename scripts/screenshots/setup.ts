import { runBackend, seedBackend } from '../../src/tests/utils';

/** Fresh demo data (English unless SCREENSHOTS_LOCALE=de) with photos, without the demo banner. */
export default async function setup() {
  runBackend('seed.removeAllData');
  // SCREENSHOTS_LOCALE=de: German demo data, e.g. for design reviews
  const locale = process.env.SCREENSHOTS_LOCALE ?? 'en';
  console.log(seedBackend(...(locale === 'de' ? [] : ['--locale', locale])));
  runBackend('featureFlags.set', { key: 'is_demo_mode', value: false });
  runBackend('featureFlags.set', { key: 'is_e2e_auth_skip_email', value: true });
}
