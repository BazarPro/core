import { useTranslation } from 'react-i18next';
import { TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { SETTINGS_TABS, settingsTabKey, type SettingsTab } from './settingsTabs';

/**
 * The row of tabs, the same for editing the settings and for reading them after the bazaar.
 * On phones it scrolls sideways, a fade at the edge says so. `invalid` marks tabs with errors.
 */
export function SettingsTabsList({
  directSale,
  invalid,
}: {
  directSale?: boolean;
  invalid?: (tab: SettingsTab) => boolean;
}) {
  const { t } = useTranslation('organizer');
  return (
    <TabsList
      aria-label={t('settingsPage.title')}
      className="flex h-auto w-full justify-start overflow-x-auto [mask-image:linear-gradient(90deg,#000_85%,transparent)] *:shrink-0 sm:grid sm:grid-cols-6 sm:[mask-image:none]"
    >
      {SETTINGS_TABS.map((id) => (
        <TabsTrigger key={id} value={id} className="px-3 py-1.5">
          {t(`wizard.short.${settingsTabKey(id, directSale)}`)}
          {invalid?.(id) && (
            <span
              className="size-1.5 rounded-full bg-destructive"
              aria-label={t('wizard.fixErrors')}
            />
          )}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
