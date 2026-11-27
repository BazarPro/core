import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { NotFoundPage } from './NotFoundPage';

describe('NotFoundPage', () => {
  it('says the address leads nowhere and offers the way to the bazaars', () => {
    render(
      <MemoryRouter initialEntries={['/gibtsnicht']}>
        <NotFoundPage />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'Diese Seite gibt es nicht' })).toBeInTheDocument();
    expect(screen.getByText(/„\/gibtsnicht“/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Basar in der Nähe finden/ })).toHaveAttribute(
      'href',
      '/bazaars'
    );
    expect(screen.getByRole('link', { name: /Zur Startseite/ })).toHaveAttribute('href', '/');
  });
});
