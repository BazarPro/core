import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { getFunctionName } from '../../../lib/api/functions';
import type { FunctionReference } from '../../../lib/api/types';
import { LoginPage } from './LoginPage';

vi.mock('../../../lib/api/react', () => ({
  useAuthState: () => ({ isLoading: false, isAuthenticated: false }),
  useAuthActions: () => ({ signIn: vi.fn() }),
  useQuery: (ref: FunctionReference<'query'>) =>
    ({ 'featureFlags.get': {}, 'authProviders.configured': {} })[getFunctionName(ref)],
}));
vi.mock('../../../context/UserRoleContext', () => ({ useUserRole: () => ({ role: null }) }));
vi.mock('../../../hooks/useRedirectAfterLogin', () => ({
  useRedirectAfterLogin: () => false,
  OVERVIEW_PATH: '/overview',
}));
vi.mock('../../../native/ServerSwitch', () => ({ ServerSwitch: () => null }));

describe('LoginPage', () => {
  it('has one way back from "forgot password", which leads to the login form', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Passwort vergessen?' }));
    expect(screen.getByRole('heading', { name: 'Passwort vergessen?' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Zurück' }));
    expect(screen.getByRole('heading', { name: 'Willkommen zurück' })).toBeInTheDocument();
  });
});
