import type deAccount from '../locales/de/account.json';
import type deAuth from '../locales/de/auth.json';
import type deCommon from '../locales/de/common.json';

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
  auth: typeof deAuth;
  account: typeof deAccount;
}
