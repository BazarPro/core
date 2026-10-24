import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Welcome } from './Welcome';

vi.mock('@capacitor/preferences', () => ({
  Preferences: { get: async () => ({ value: null }), set: async () => {}, remove: async () => {} },
}));

const assign = vi.fn();
let flags: (() => Response) | null;

beforeEach(() => {
  assign.mockClear();
  flags = null;
  vi.stubGlobal('location', { ...window.location, assign });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (!flags) throw new TypeError('Failed to fetch');
      return flags();
    })
  );
});

const answer = (value: Record<string, boolean>) => () =>
  new Response(JSON.stringify({ value, topics: [] }), { status: 200 });
const demoFlag = (value: boolean) => answer({ is_demo_mode: value });

const DEMO_NOTICE = /Demo-Modus/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Welcome', () => {
  it('explains BazarPro on cards to swipe through', () => {
    render(<Welcome server="https://bazarpro.de" />);
    expect(screen.getAllByRole('group')).toHaveLength(6);
    expect(screen.getByText('Annahme und Kasse per Scan')).toBeInTheDocument();
    expect(screen.getByText('Auch für euren Verein')).toBeInTheDocument();
  });

  it('marks the card chosen by its dot', () => {
    render(<Welcome server="https://bazarpro.de" />);
    const dots = screen.getAllByRole('button', { name: /von 6/ });
    expect(dots[0]).toHaveAttribute('aria-current', 'true');
    fireEvent.click(dots[2]);
    expect(dots[2]).toHaveAttribute('aria-current', 'true');
    expect(dots[0]).toHaveAttribute('aria-current', 'false');
  });

  it('leads to registration and sign-in', () => {
    render(<Welcome server="https://bazarpro.de" />);
    fireEvent.click(screen.getByRole('button', { name: 'Konto erstellen' }));
    expect(assign).toHaveBeenLastCalledWith('/register');
    fireEvent.click(screen.getByRole('button', { name: 'Anmelden' }));
    expect(assign).toHaveBeenLastCalledWith('/login');
  });

  it('shows the server and lets a self-hoster enter their own', () => {
    render(<Welcome server="https://basar.verein.de" />);
    expect(screen.getByText('Verbunden mit basar.verein.de')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Eigenen Server verbinden' }));
    expect(screen.getByRole('textbox', { name: 'Server-Adresse' })).toHaveValue(
      'https://basar.verein.de'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(screen.getByRole('button', { name: 'Konto erstellen' })).toBeInTheDocument();
  });

  it('shows the demo notice when the server is in demo mode', async () => {
    flags = demoFlag(true);
    render(<Welcome server="https://bazarpro.de" />);
    expect(await screen.findByText(DEMO_NOTICE)).toBeInTheDocument();
  });

  it('shows no demo notice outside demo mode or without the server', async () => {
    flags = demoFlag(false);
    const { unmount } = render(<Welcome server="https://bazarpro.de" />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByText(DEMO_NOTICE)).not.toBeInTheDocument();
    unmount();

    flags = null;
    render(<Welcome server="https://bazarpro.de" />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(DEMO_NOTICE)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Konto erstellen' })).toBeInTheDocument();
  });

  it('hides registration and sign-in when the server has them off', async () => {
    flags = answer({ is_registration_enabled: false });
    const { unmount } = render(<Welcome server="https://bazarpro.de" />);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Konto erstellen' })).not.toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'Anmelden' })).toBeInTheDocument();
    unmount();

    flags = answer({ is_login_enabled: false, is_registration_enabled: true });
    render(<Welcome server="https://bazarpro.de" />);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Anmelden' })).not.toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'Konto erstellen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eigenen Server verbinden' })).toBeInTheDocument();
  });
});
