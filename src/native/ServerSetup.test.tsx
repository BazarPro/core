import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeServer, saveServer } from './settings';
import { ServerSetup } from './ServerSetup';

const stored = vi.hoisted(() => new Map<string, string>());
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: stored.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => void stored.set(key, value),
    remove: async ({ key }: { key: string }) => void stored.delete(key),
  },
}));

let config: (url: string) => Response;
const replace = vi.fn();

beforeEach(() => {
  stored.clear();
  replace.mockClear();
  vi.stubGlobal('location', { ...window.location, replace });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => config(url))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const answer = (value: unknown) =>
  new Response(JSON.stringify({ value, topics: [] }), { status: 200 });

function connect(address: string) {
  render(<ServerSetup />);
  const input = screen.getByRole('textbox', { name: 'Server-Adresse' });
  fireEvent.change(input, { target: { value: address } });
  fireEvent.click(screen.getByRole('button', { name: 'Verbinden' }));
}

describe('ServerSetup', () => {
  it('suggests bazarpro.de', () => {
    render(<ServerSetup />);
    expect(screen.getByRole('textbox', { name: 'Server-Adresse' })).toHaveValue(
      'https://bazarpro.de'
    );
  });

  it('remembers a server that supports the app, with its mode', async () => {
    const urls: string[] = [];
    config = (url) => {
      urls.push(url);
      return answer({ mode: 'single', appApi: 1 });
    };
    connect('verein.example/basar/');
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(urls).toEqual(['https://verein.example/api/query/instance.getConfig']);
    expect(stored.get('bazarpro.server')).toBe('https://verein.example');
    expect(stored.get('bazarpro.mode')).toBe('single');
  });

  it('refuses servers from before the app', async () => {
    config = () => answer({ mode: 'platform' });
    connect('alt.example');
    expect(await screen.findByText(/zu alt für die App/)).toBeInTheDocument();
    expect(stored.size).toBe(0);
  });

  it('says when nothing answers at the address', async () => {
    config = () => {
      throw new TypeError('Failed to fetch');
    };
    connect('nirgends.example');
    expect(await screen.findByText(/kein BazarPro erreichbar/)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('settings', () => {
  it('turns typed addresses into origins', () => {
    expect(normalizeServer(' bazarpro.de ')).toBe('https://bazarpro.de');
    expect(normalizeServer('http://192.168.1.5:3000/x')).toBe('http://192.168.1.5:3000');
    expect(normalizeServer('')).toBeNull();
    expect(normalizeServer('https://')).toBeNull();
  });

  it('forgets the token when the server changes', async () => {
    stored.set('bazarpro.token', 'alt');
    await saveServer('https://neu.example', 'platform');
    expect(stored.get('bazarpro.token')).toBeUndefined();
    await saveServer(null, null);
    expect(stored.size).toBe(0);
  });
});
