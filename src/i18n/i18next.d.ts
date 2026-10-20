import 'i18next';
import type { SourceResources } from './resources';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: SourceResources;
  }
}
