import i18n from '.';

/**
 * Zod error option whose text is read in the current language at validation time,
 * so schemas can be built once: `z.string().min(3, zodMessage('form.titleShort', 'organizer'))`.
 */
export function zodMessage(key: string, ns: string, values?: Record<string, unknown>) {
  return { error: () => i18n.t(key as never, { ns, ...values }) as string };
}
