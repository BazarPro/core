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
  it('stays on the overview when the new role has no page yet', () => {
    renderAt('/');
    act(() => switchTo('organizer'));
    expect(screen.getByTestId('probe')).toHaveTextContent('organizer /');
  });

  it('also leads from the overview back to where the new role was left', () => {
    localStorage.setItem('lastPath.organizer', '/events/view/e1/products');
    renderAt('/');
    act(() => switchTo('organizer'));
    expect(screen.getByTestId('probe')).toHaveTextContent('organizer /events/view/e1/products');
  });

  it('remembers only pages of the side menu', () => {
    localStorage.setItem('lastPath.organizer', '/events/new');
    renderAt('/my-products');
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

  it('keeps the role on the account page, which belongs to every role', () => {
    localStorage.setItem('userRole', 'organizer');
    renderAt('/account');
    expect(screen.getByTestId('probe')).toHaveTextContent('organizer /account');
  });

  it('remembers the overview as the last page of the current role', () => {
    localStorage.setItem('userRole', 'participant');
    renderAt('/');
    expect(localStorage.getItem('lastPath.participant')).toBe('/');
  });

  it.each([
    ['/my-sales', 'participant'],
    ['/browse-events', 'participant'],
    ['/events/view/e1/checkout', 'organizer'],
    ['/admin/users', 'administrator'],
  ])('takes the role of the page %s', (path, expected) => {
    localStorage.setItem('userRole', expected === 'participant' ? 'organizer' : 'participant');
    renderAt(path);
    expect(screen.getByTestId('probe')).toHaveTextContent(`${expected} ${path}`);
    expect(localStorage.getItem(`lastPath.${expected}`)).toBe(path);
  });

  it('takes the role of a page outside the menu without remembering it', () => {
    localStorage.setItem('userRole', 'organizer');
    renderAt('/products/edit/p1');
    expect(screen.getByTestId('probe')).toHaveTextContent('participant /products/edit/p1');
    expect(localStorage.getItem('lastPath.participant')).toBeNull();
  });

  it('keeps the role on pages of no role', () => {
    localStorage.setItem('userRole', 'organizer');
    renderAt('/public-events/e1');
    expect(screen.getByTestId('probe')).toHaveTextContent('organizer /public-events/e1');
  });
});
