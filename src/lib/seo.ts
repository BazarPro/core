import { stripMarkdownToText } from './markdown';

const DEFAULT_SITE_NAME = 'BazarPro';
const DEFAULT_DESCRIPTION =
  'BazarPro hilft Veranstaltern und Verkaeufern, lokale Events und Angebote sichtbar zu machen.';

export function getDefaultSiteName(): string {
  return DEFAULT_SITE_NAME;
}

export function getDefaultDescription(): string {
  return DEFAULT_DESCRIPTION;
}

export function getSiteUrl(): string {
  const envUrl = import.meta.env.VITE_SITE_URL as string | undefined;
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
    return start.toLocaleDateString('de-DE', dateOptions);
  }
  return `${start.toLocaleDateString('de-DE', dateOptions)} - ${end.toLocaleDateString('de-DE', dateOptions)}`;
}
