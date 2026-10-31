import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { switchServer } from './settings';
import { serverFitsApp } from './serverCheck';
import { AppErrorBoundary } from './StartProblem';

vi.mock('./settings', () => ({ MIN_APP_API: 1, switchServer: vi.fn() }));

const SERVER = 'https://review-1.bazarpro.de';

afterEach(() => {
  vi.unstubAllGlobals();
});

function Broken(): never {
  throw new Error('users.viewer failed');
}

describe('start of the app', () => {
  it('shows what failed with the server and leads to the server choice', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <AppErrorBoundary server={SERVER}>
        <Broken />
      </AppErrorBoundary>
    );
    expect(screen.getByRole('alert')).toHaveTextContent('review-1.bazarpro.de');
    fireEvent.click(screen.getByRole('button', { name: 'Server wechseln' }));
    expect(switchServer).toHaveBeenCalledOnce();
  });

  it('sees a server that is gone or too old, but not one that cannot be reached', async () => {
    const answering = (response: () => Response | Promise<Response>) =>
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => response())
      );

    answering(() => new Response('<html>404 page not found</html>', { status: 404 }));
    expect(await serverFitsApp(SERVER)).toBe(false);
    answering(() => new Response('<html>Anderes</html>', { status: 200 }));
    expect(await serverFitsApp(SERVER)).toBe(false);
    answering(() => new Response(JSON.stringify({ value: {}, topics: [] })));
    expect(await serverFitsApp(SERVER)).toBe(false);

    answering(() => new Response(JSON.stringify({ value: { appApi: 1 }, topics: [] })));
    expect(await serverFitsApp(SERVER)).toBe(true);
    // Offline the app works with what is on the device; server errors may pass
    answering(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await serverFitsApp(SERVER)).toBe(true);
    answering(() => new Response('Bad Gateway', { status: 502 }));
    expect(await serverFitsApp(SERVER)).toBe(true);
  });
});
