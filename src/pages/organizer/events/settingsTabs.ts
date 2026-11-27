import { useSearchParams } from 'react-router-dom';

/** The tabs of a bazaar's settings, in the order of the wizard's steps. */
export const SETTINGS_TABS = [
  'basics',
  'sale',
  'items',
  'fees',
  'registration',
  'logistics',
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

export function isSettingsTab(value: string | null): value is SettingsTab {
  return (SETTINGS_TABS as readonly string[]).includes(value ?? '');
}

/** Drop-off and pickup are called set-up and tear-down when sellers sell themselves. */
export function settingsTabKey<T extends string>(id: T, directSale: boolean | undefined) {
  return id === 'logistics' && directSale ? 'logisticsDirect' : id;
}

/**
 * The open tab, kept in the address (`?tab=`): a link can open one, and reloading keeps it.
 * The first tab has no parameter.
 */
export function useSettingsTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const param = searchParams.get('tab');
  const tab: SettingsTab = isSettingsTab(param) ? param : 'basics';
  const openTab = (next: SettingsTab) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'basics') params.delete('tab');
    else params.set('tab', next);
    setSearchParams(params, { replace: true });
  };
  return [tab, openTab] as const;
}
