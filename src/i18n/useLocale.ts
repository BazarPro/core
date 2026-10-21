import { useCallback, useEffect, useRef } from 'react';
import { useAuthState, useMutation, useQuery } from '../lib/api/react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api/functions';
import type { Locale } from '../shared/constants';
import { currentLocale } from '.';

/** The current language and a setter that also saves it at the account. */
export function useLocale(): [Locale, (locale: Locale) => void] {
  const { i18n } = useTranslation();
  const { isAuthenticated } = useAuthState();
  const save = useMutation(api.users.setMyLocale);
  const setLocale = useCallback(
    (locale: Locale) => {
      void i18n.changeLanguage(locale);
      if (isAuthenticated) void save({ locale });
    },
    [i18n, isAuthenticated, save]
  );
  return [currentLocale(), setLocale];
}

/**
 * After login the account's language wins; an account without one takes the current
 * language, so emails reach the user in it.
 */
export function useSyncAccountLocale() {
  const { i18n } = useTranslation();
  const viewer = useQuery(api.users.viewer);
  const save = useMutation(api.users.setMyLocale);
  const synced = useRef<string | null>(null);

  useEffect(() => {
    if (!viewer || synced.current === viewer._id) return;
    synced.current = viewer._id;
    if (viewer.locale) {
      if (viewer.locale !== currentLocale()) void i18n.changeLanguage(viewer.locale);
    } else {
      void save({ locale: currentLocale() });
    }
  }, [viewer, i18n, save]);
}
