import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { UserRole } from '../../context/UserRoleContext';
import { useEventAccess } from '../../hooks/useEventAccess';
import type { Id } from '../../lib/api/types';
import '../../i18n';
import { BottomNav } from './BottomNav';

vi.mock('../../lib/api/react', () => ({ useQuery: vi.fn() }));
vi.mock('../../hooks/useInstanceConfig', () => ({
  useInstanceConfig: () => ({ isSingle: false }),
}));
vi.mock('../../context/UserRoleContext', () => ({
  useUserRole: () => ({ changeRole: vi.fn() }),
}));
vi.mock('../../context/SidebarContext', () => ({
  useSidebar: () => ({ setMobileSidebarOpen: vi.fn() }),
}));
vi.mock('../../hooks/useEventAccess', () => ({ useEventAccess: vi.fn() }));
vi.mock('../scanner/TeamScanner', () => ({ TeamScanner: () => null }));

const EVENT = 'event1' as Id<'events'>;

function tabLabels(role: UserRole, eventId?: Id<'events'>) {
  render(
    <MemoryRouter>
      <BottomNav role={role} isAdmin={role === 'administrator'} currentPage="/" eventId={eventId} />
    </MemoryRouter>
  );
  return within(screen.getByRole('navigation'))
    .getAllByRole('button')
    .map((tab) => tab.textContent);
}

function access(canManage: boolean) {
  vi.mocked(useEventAccess).mockReturnValue({ canManage } as ReturnType<typeof useEventAccess>);
}

describe('tab bar', () => {
  it('has the scanner in the middle for whoever runs the bazaar, without the overview', () => {
    access(true);
    expect(tabLabels('organizer', EVENT)).toEqual([
      'Verkäufer',
      'Artikel',
      'Scannen',
      'Kasse',
      'Menü',
    ]);
  });

  it('has no scanner without the right to run the bazaar', () => {
    access(false);
    expect(tabLabels('organizer', EVENT)).toEqual(['Verkäufer', 'Artikel', 'Kasse', 'Menü']);
  });

  it('leaves the overview to the menu for sellers too', () => {
    expect(tabLabels('participant')).toEqual(['Artikel', 'Verkäufe', 'Basare', 'Menü']);
  });
});
