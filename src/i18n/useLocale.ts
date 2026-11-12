import { useCallback, useEffect, useRef } from 'react';
import { useAuthState, useMutation, useQuery } from '../lib/api/react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api/functions';
import type { Locale } from '../shared/constants';
import { localizedPath } from '../shared/localizedRoutes';
import { currentLocale, detectLocale, pageLocale, rememberedSignIn, storeLocale } from '.';

/**
 * The current language and a setter that also saves it at the account. On a page with
 * an address per language the setter opens that language's address.
 */
export function useLocale(): [Locale, (locale: Locale) => void] {
  const { i18n } = useTranslation();
  const { isAuthenticated } = useAuthState();
  const save = useMutation(api.users.setMyLocale);
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const setLocale = useCallback(
    (locale: Locale) => {
      storeLocale(locale);
      void i18n.changeLanguage(locale);
      if (isAuthenticated) void save({ locale });
      if (pageLocale(pathname, isAuthenticated)) {
        const target = localizedPath(pathname, locale);
        if (target !== pathname) navigate(`${target}${search}${hash}`);
      }
    },
    [i18n, isAuthenticated, save, pathname, search, hash, navigate]
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
      storeLocale(viewer.locale);
      // A page with an address per language keeps the language of its address
      const dictated = pageLocale(window.location.pathname, true);
      if (!dictated && viewer.locale !== currentLocale()) void i18n.changeLanguage(viewer.locale);
    } else {
      void save({ locale: currentLocale() });
    }
  }, [viewer, i18n, save]);
}

/**
 * Follows the address while navigating: `/en/features` is English, `/features` German,
 * other pages return to the visitor's own language.
 */
export function useLocaleFromRoute() {
  const { pathname } = useLocation();
  const { isAuthenticated, isLoading } = useAuthState();
  const { i18n } = useTranslation();

  useEffect(() => {
    const signedIn = isLoading ? rememberedSignIn() : isAuthenticated;
    const locale = detectLocale(pathname, signedIn);
    if (locale !== currentLocale()) void i18n.changeLanguage(locale);
  }, [pathname, isAuthenticated, isLoading, i18n]);
}

/** Links to pages with an address per language point to the current language's one. */
export function useLocalizedPath(): (path: string) => string {
  // Re-renders the caller when the language changes, so its links follow
  useTranslation();
  const locale = currentLocale();
  return (path: string) => localizedPath(path, locale);
}
