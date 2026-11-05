import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackButton } from './BackButton';

const user = vi.hoisted(() => ({ role: 'organizer' as string | null }));
vi.mock('../../context/UserRoleContext', () => ({ useUserRole: () => ({ role: user.role }) }));

function CurrentPath() {
  const { pathname, search } = useLocation();
  return <output data-testid="path">{`${pathname}${search}`}</output>;
}

function renderAt(url: string, props: React.ComponentProps<typeof BackButton> = {}) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <BackButton {...props} />
      <CurrentPath />
    </MemoryRouter>
  );
}

const clickBack = () => fireEvent.click(screen.getByRole('button'));
const currentPath = () => screen.getByTestId('path').textContent;
const remember = (key: string, ...paths: string[]) =>
  sessionStorage.setItem(key, JSON.stringify(paths));

describe('BackButton', () => {
  beforeEach(() => {
    sessionStorage.clear();
    user.role = 'organizer';
  });

  it('leaves going back to the page that asked for it', () => {
    const onBack = vi.fn();
    remember('navHistory.role.organizer', '/events', '/events/1');
    renderAt('/events/1', { onBack });
    clickBack();
    expect(onBack).toHaveBeenCalledOnce();
    expect(currentPath()).toBe('/events/1');
  });

  it('goes to the fallback when there is no history', () => {
    renderAt('/events/1', { fallbackPath: '/events' });
    clickBack();
    expect(currentPath()).toBe('/events');
  });

  it('goes to the start page without history or fallback', () => {
    renderAt('/events/1');
    clickBack();
    expect(currentPath()).toBe('/');
  });

  it("follows the role's history on a page of the app", () => {
    remember('navHistory.global', '/elsewhere', '/events/1');
    remember('navHistory.role.organizer', '/events', '/events/1');
    renderAt('/events/1?tab=items', { fallbackPath: '/unused' });
    clickBack();
    expect(currentPath()).toBe('/events/1');
  });

  it.each([
    '/',
    '/login',
    '/register',
    '/password-reset-request',
    '/features',
    '/pricing',
    '/about',
    '/contact',
    '/privacy',
    '/terms',
    '/imprint',
    '/public-events/1',
    '/products/view/1',
  ])('follows the global history on the public page %s', (path) => {
    remember('navHistory.global', '/from-global', path);
    remember('navHistory.role.organizer', '/from-role', path);
    renderAt(path);
    clickBack();
    expect(currentPath()).toBe('/from-global');
  });

  it('names itself "Zurück", or what the page calls it', () => {
    renderAt('/events/1');
    expect(screen.getByRole('button', { name: 'Zurück' })).toHaveTextContent('Zurück');
  });

  it('shows a given title and label', () => {
    renderAt('/events/1', { title: 'Zur Übersicht', 'aria-label': 'Zurück zur Übersicht' });
    const button = screen.getByRole('button', { name: 'Zurück zur Übersicht' });
    expect(button).toHaveTextContent('Zur Übersicht');
  });

  it('lines up a ghost button with the content by its text', () => {
    renderAt('/events/1', { variant: 'ghost', className: 'extra' });
    expect(screen.getByRole('button')).toHaveClass('-ml-3', 'extra');
  });

  it('keeps other variants at their edge', () => {
    renderAt('/events/1', { variant: 'outline' });
    expect(screen.getByRole('button')).not.toHaveClass('-ml-3');
  });
});
