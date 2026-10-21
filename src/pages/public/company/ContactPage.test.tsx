import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMutation } from '../../../lib/api/react';
import { useInstanceConfig } from '../../../hooks/useInstanceConfig';
import { ContactPage } from './ContactPage';

vi.mock('../../../lib/api/react', () => ({ useMutation: vi.fn() }));
vi.mock('../../../hooks/useInstanceConfig', () => ({ useInstanceConfig: vi.fn() }));
vi.mock('../../../components/seo/Seo', () => ({ Seo: () => null }));
vi.mock('../../../components/layout/Footer', () => ({ Footer: () => null }));

type InstanceConfig = ReturnType<typeof useInstanceConfig>;

function renderPage(config: Partial<InstanceConfig>) {
  const sendMessage = vi.fn().mockResolvedValue(undefined);
  vi.mocked(useMutation).mockReturnValue(sendMessage as unknown as ReturnType<typeof useMutation>);
  vi.mocked(useInstanceConfig).mockReturnValue(config as InstanceConfig);
  render(
    <MemoryRouter>
      <ContactPage />
    </MemoryRouter>
  );
  return { sendMessage };
}

describe('ContactPage', () => {
  beforeEach(() => {
    // jsdom has no ResizeObserver; the checkbox component uses it
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  });

  it('shows the address of BazarPro on the platform', () => {
    renderPage({ isSingle: false, brand: 'BazarPro' });
    expect(screen.getByText('kontakt@bazarpro.de')).toBeInTheDocument();
  });

  it('shows the association and its contact address on a self-hosted instance', () => {
    renderPage({ isSingle: true, brand: 'Kinderbasar Ulm', contactEmail: 'basar@ulm.de' });
    expect(screen.getByText(/Fragen zu Kinderbasar Ulm/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'basar@ulm.de' })).toHaveAttribute(
      'href',
      'mailto:basar@ulm.de'
    );
    expect(screen.queryByText('kontakt@bazarpro.de')).toBeNull();
    expect(screen.queryByText(/Syrlinstraße/)).toBeNull();
  });

  it('without a contact address the self-hosted page shows none', () => {
    renderPage({ isSingle: true, brand: 'Basar' });
    expect(screen.queryByRole('link', { name: /@/ })).toBeNull();
  });

  it('sends the message only with accepted privacy policy', async () => {
    const { sendMessage } = renderPage({ isSingle: true, brand: 'Basar' });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Erika' } });
    fireEvent.change(screen.getByLabelText('E-Mail'), { target: { value: 'erika@test.de' } });
    fireEvent.change(screen.getByLabelText('Nachricht'), {
      target: { value: 'Wann ist der nächste Basar?' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Nachricht senden' }));

    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({
        name: 'Erika',
        email: 'erika@test.de',
        message: 'Wann ist der nächste Basar?',
        acceptedPrivacyPolicy: true,
      })
    );
    expect(await screen.findByText('Vielen Dank!')).toBeInTheDocument();
  });
});
