import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { UserRoleProvider } from './UserRoleProvider';
import { useUserRole, type UserRole } from './UserRoleContext';

let switchTo: (role: UserRole) => void;

function Probe() {
  const { role, changeRole } = useUserRole();
  const location = useLocation();
  switchTo = changeRole;
  return <p data-testid="probe">{`${role} ${location.pathname}`}</p>;
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <UserRoleProvider>
        <Probe />
      </UserRoleProvider>
    </MemoryRouter>
  );
}

beforeEach(() => localStorage.clear());

describe('switching the role', () => {
  it('stays on the overview, which then shows the new role', () => {
    renderAt('/');
    act(() => switchTo('organizer'));
    expect(screen.getByTestId('probe')).toHaveTextContent('organizer /');
  });

  it('leads to the last page of the new role', () => {
    localStorage.setItem('lastPath.organizer', '/events/view/e1/checkout');
    renderAt('/my-products');
    act(() => switchTo('organizer'));
    expect(screen.getByTestId('probe')).toHaveTextContent('organizer /events/view/e1/checkout');
  });

  it('leads to the overview of a role not used before', () => {
    renderAt('/my-products');
    act(() => switchTo('administrator'));
    expect(screen.getByTestId('probe')).toHaveTextContent('administrator /');
  });

  it('remembers the overview as the last page of the current role', () => {
    localStorage.setItem('userRole', 'organizer');
    renderAt('/');
    expect(localStorage.getItem('lastPath.organizer')).toBe('/');
  });

  it.each([
    ['/my-sales', 'participant'],
    ['/products/edit/p1', 'participant'],
    ['/events/view/e1/checkout', 'organizer'],
    ['/admin/users', 'administrator'],
  ])('takes the role of the page %s', (path, expected) => {
    localStorage.setItem('userRole', expected === 'participant' ? 'organizer' : 'participant');
    renderAt(path);
    expect(screen.getByTestId('probe')).toHaveTextContent(`${expected} ${path}`);
    expect(localStorage.getItem(`lastPath.${expected}`)).toBe(path);
  });

  it('keeps the role on pages of no role', () => {
    localStorage.setItem('userRole', 'organizer');
    renderAt('/public-events/e1');
    expect(screen.getByTestId('probe')).toHaveTextContent('organizer /public-events/e1');
  });
});
