import { stripMarkdownToText } from './markdown';
import { runtimeConfig } from './runtimeConfig';
import i18n from '../i18n';
import { dateLocale } from '../i18n/format';

const DEFAULT_SITE_NAME = 'BazarPro';

/** Preview image for links shared on social media and in search results */
export const DEFAULT_SEO_IMAGE = '/og-image.png';

export function getDefaultSiteName(): string {
  return DEFAULT_SITE_NAME;
}

export function getDefaultDescription(): string {
  return i18n.t('meta.defaultDescription', { ns: 'landing' });
}

export function getSiteUrl(): string {
  const envUrl = runtimeConfig.siteUrl;
  if (envUrl && envUrl.trim()) {
    return envUrl.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'https://bazarpro.de';
}

export function toAbsoluteUrl(value?: string): string | undefined {
  if (!value || !value.trim()) return undefined;
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  const base = getSiteUrl();
  const normalized = value.startsWith('/') ? value : `/${value}`;
  return `${base}${normalized}`;
}

export function truncateText(value: string, maxLength = 160): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trim()}...`;
}

export function buildSeoDescription(value: string | undefined, fallback: string): string {
  if (!value || !value.trim()) {
    return truncateText(fallback);
  }
  const text = stripMarkdownToText(value);
  if (!text) return truncateText(fallback);
  return truncateText(text);
}

export function formatDateRange(startDate: number, endDate: number): string {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const sameDay =
    start.getDate() === end.getDate() &&
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear();

  const dateOptions: Intl.DateTimeFormatOptions = { dateStyle: 'medium' };
  if (sameDay) {
    return start.toLocaleDateString(dateLocale(), dateOptions);
  }
  return `${start.toLocaleDateString(dateLocale(), dateOptions)} - ${end.toLocaleDateString(dateLocale(), dateOptions)}`;
}
