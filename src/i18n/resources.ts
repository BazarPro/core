import type deAccount from '../locales/de/account.json';
import type deAuth from '../locales/de/auth.json';
import type deCommon from '../locales/de/common.json';
import type deCompany from '../locales/de/company.json';
import type deLanding from '../locales/de/landing.json';
import type deAdmin from '../locales/de/admin.json';
import type deOrganizer from '../locales/de/organizer.json';
import type deOnboarding from '../locales/de/onboarding.json';
import type deModeration from '../locales/de/moderation.json';
import type deProduct from '../locales/de/product.json';
import type deEvents from '../locales/de/events.json';
import type deSales from '../locales/de/sales.json';
import type deSeller from '../locales/de/seller.json';
import type deRecords from '../locales/de/records.json';
import type deErrors from '../locales/de/errors.json';
import type deDashboard from '../locales/de/dashboard.json';

/**
 * All translation files: src/locales/<language>/<namespace>.json. German is the
 * source; a new language only needs its folder and an entry in LOCALES.
 */
const files = import.meta.glob<{ default: Record<string, unknown> }>('../locales/*/*.json', {
  eager: true,
});

export const resources: Record<string, Record<string, Record<string, unknown>>> = {};
for (const [path, module] of Object.entries(files)) {
  const [, language, namespace] = path.match(/locales\/([^/]+)\/([^/]+)\.json$/) ?? [];
  if (!language || !namespace) continue;
  resources[language] ??= {};
  resources[language][namespace] = module.default;
}

/** German texts define the keys; TypeScript checks every t() call against them. */
export interface SourceResources {
  common: typeof deCommon;
  company: typeof deCompany;
  landing: typeof deLanding;
  admin: typeof deAdmin;
  organizer: typeof deOrganizer;
  onboarding: typeof deOnboarding;
  moderation: typeof deModeration;
  product: typeof deProduct;
  events: typeof deEvents;
  sales: typeof deSales;
  seller: typeof deSeller;
  records: typeof deRecords;
  auth: typeof deAuth;
  account: typeof deAccount;
  errors: typeof deErrors;
  dashboard: typeof deDashboard;
}
