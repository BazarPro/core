import {
  MODERATION_ACTIONS,
  REPORT_REASONS,
  REPORT_TARGETS,
  type ModerationAction,
  type ReportReason,
  type ReportTarget,
} from '../../convex/constants';
import i18n from '../i18n';
import { dateLocale } from '../i18n/format';

/** Labels in the current language, read when accessed (src/locales/<lang>/moderation.json). */
function labels<K extends string>(group: 'reason' | 'target' | 'action', keys: readonly K[]) {
  const result = {} as Record<K, string>;
  for (const key of keys) {
    Object.defineProperty(result, key, {
      enumerable: true,
      get: () => i18n.t(`${group}.${key}` as never, { ns: 'moderation' }) as string,
    });
  }
  return result;
}

export const REPORT_REASON_LABELS: Record<ReportReason, string> = labels('reason', REPORT_REASONS);

export const REPORT_TARGET_LABELS: Record<ReportTarget, string> = labels('target', REPORT_TARGETS);

export const MODERATION_ACTION_LABELS: Record<ModerationAction, string> = labels(
  'action',
  MODERATION_ACTIONS
);

export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(dateLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
