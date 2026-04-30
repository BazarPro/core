import { stripMarkdownToText } from './markdown';

export interface CalendarExportEvent {
  title: string;
  description?: string;
  location: string;
  startDate: number;
  endDate: number;
  url?: string;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function toIcsUtcDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return [
    date.getUTCFullYear(),
    pad2(date.getUTCMonth() + 1),
    pad2(date.getUTCDate()),
    'T',
    pad2(date.getUTCHours()),
    pad2(date.getUTCMinutes()),
    pad2(date.getUTCSeconds()),
    'Z',
  ].join('');
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function normalizeDateRange(
  startDate: number,
  endDate: number
): { startDate: number; endDate: number } {
  if (endDate > startDate) {
    return { startDate, endDate };
  }

  // Fallback for invalid date ranges to keep export valid.
  return { startDate, endDate: startDate + 60 * 60 * 1000 };
}

function toCalendarDescription(description?: string, url?: string): string {
  const parts: string[] = [];
  if (description?.trim()) {
    parts.push(stripMarkdownToText(description.trim()));
  }
  if (url?.trim()) {
    parts.push(`Mehr Infos: ${url.trim()}`);
  }
  return parts.join('\n\n');
}

function toFileName(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `${slug || 'event'}.ics`;
}

export function createGoogleCalendarUrl(event: CalendarExportEvent): string {
  const { startDate, endDate } = normalizeDateRange(event.startDate, event.endDate);
  const details = toCalendarDescription(event.description, event.url);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${toIcsUtcDateTime(startDate)}/${toIcsUtcDateTime(endDate)}`,
    location: event.location,
    details,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function createIcsContent(event: CalendarExportEvent): string {
  const { startDate, endDate } = normalizeDateRange(event.startDate, event.endDate);
  const now = Date.now();
  const details = toCalendarDescription(event.description, event.url);
  const uid = `${now}-${Math.random().toString(36).slice(2)}@bazarpro.de`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BazarPro//Event Export//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toIcsUtcDateTime(now)}`,
    `DTSTART:${toIcsUtcDateTime(startDate)}`,
    `DTEND:${toIcsUtcDateTime(endDate)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `LOCATION:${escapeIcsText(event.location)}`,
    `DESCRIPTION:${escapeIcsText(details)}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

export function downloadIcsEvent(event: CalendarExportEvent): void {
  const blob = new Blob([createIcsContent(event)], {
    type: 'text/calendar;charset=utf-8',
  });
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = toFileName(event.title);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(downloadUrl);
}
