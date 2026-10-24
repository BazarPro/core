import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerSwitch } from './ServerSwitch';
import { switchServer } from './settings';

const platform = vi.hoisted(() => ({ native: false }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => platform.native },
}));
vi.mock('./settings', () => ({ switchServer: vi.fn() }));
vi.mock('../lib/runtimeConfig', () => ({
  runtimeConfig: { siteUrl: 'https://verein.example' },
}));

describe('ServerSwitch', () => {
  beforeEach(() => {
    vi.mocked(switchServer).mockClear();
  });

  it('is not there on the web', () => {
    platform.native = false;
    const { container } = render(<ServerSwitch />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the server in the app and leads back to the server choice', () => {
    platform.native = true;
    render(<ServerSwitch />);
    expect(screen.getByText('Verbunden mit verein.example')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Server wechseln' }));
    expect(switchServer).toHaveBeenCalledOnce();
  });
});
