import { runBackend, seedBackend } from './utils';

/** A fresh database with the demo data for every run (see playwright.config.ts). */
async function globalSetup() {
  try {
    runBackend('seed.removeAllData');
    console.log(seedBackend('--no-images'));
    // Never send real emails from E2E runs (sale, offer and question notifications)
    runBackend('featureFlags.set', { key: 'is_e2e_auth_skip_email', value: true });
  } catch (error) {
    console.error('❌ Database setup failed');
    throw error;
  }
}
export default globalSetup;
