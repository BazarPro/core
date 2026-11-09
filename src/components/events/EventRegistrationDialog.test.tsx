import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Id } from '../../lib/api/types';
import { EventRegistrationDialog } from './EventRegistrationDialog';

/** Answers of the queries by function name */
const answers = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('../../lib/api/react', async () => {
  const { getFunctionName } = await import('../../lib/api/functions');
  return {
    useQuery: (fn: unknown, args: unknown) =>
      args === 'skip' ? undefined : answers.current[getFunctionName(fn)],
    useMutation: () => vi.fn(),
  };
});

const eventId = '0199f2a4-7c1e-7b3a-9d2e-5f6a7b8c9d0e' as Id<'events'>;

function renderDialog(features: Record<string, unknown>, invitation?: string) {
  render(
    <EventRegistrationDialog
      open
      onOpenChange={() => {}}
      eventId={eventId}
      eventTitle="Kinderbasar"
      hasAccessCode={false}
      invitation={invitation}
      conditions={{ commission: 10, features }}
      onSuccess={() => {}}
    />
  );
}

describe('EventRegistrationDialog', () => {
  beforeEach(() => {
    answers.current = {
      'users.viewer': { _id: 'u1' },
      'users.getMissinfProfileData': [],
      'eventExclusions.getMine': null,
    };
  });

  it('says that the registration is closed instead of offering to join', () => {
    renderDialog({ registrationOpen: false });
    expect(screen.getByText('Anmeldung geschlossen')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Anmelden bestätigen' })).toBeNull();
  });

  it('names the time the registration opens', () => {
    const opensAt = Date.now() + 86_400_000;
    renderDialog({ registrationStartsAt: opensAt });
    expect(screen.getByText(/^Anmeldung ab /)).toBeVisible();
  });

  it('lets invited people join although the registration is closed', () => {
    renderDialog({ registrationOpen: false }, 'token');
    expect(screen.queryByText('Anmeldung geschlossen')).toBeNull();
    expect(screen.getByRole('button', { name: 'Anmelden bestätigen' })).toBeEnabled();
  });

  it('tells excluded sellers why they cannot join, also with an invitation', () => {
    answers.current['eventExclusions.getMine'] = { excludedAt: 1, reason: 'Nicht abgeholt' };
    renderDialog({}, 'token');
    expect(
      screen.getByText('Der Veranstalter hat dich von diesem Basar ausgeschlossen.')
    ).toBeVisible();
    expect(screen.getByText('Begründung: Nicht abgeholt')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Anmelden bestätigen' })).toBeNull();
  });
});
