import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Doc } from '../../lib/api/types';
import { ValidateProfileInformation } from './ValidateProfileInformation';

const update = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../../lib/api/react', () => ({ useMutation: () => update }));

const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

function renderAddressStep(country?: string) {
  render(
    <ValidateProfileInformation
      missingProfileData={['street', 'zipCode', 'city', 'country']}
      user={{ country } as Doc<'users'>}
    />
  );
  fill('Straße und Hausnummer', 'Kirchstraße 12');
  fill('Ort', 'Bregenz');
}

describe('ValidateProfileInformation', () => {
  beforeEach(() => update.mockClear());

  it('preselects Germany and checks the postal code by the chosen country', async () => {
    renderAddressStep();
    expect(screen.getByLabelText('Land')).toHaveValue('DE');
    fill('Postleitzahl', '6900');
    fireEvent.click(screen.getByRole('button', { name: 'Adresse speichern' }));
    expect(await screen.findByText('Ungültige Postleitzahl für dieses Land')).toBeVisible();
    expect(update).not.toHaveBeenCalled();

    fill('Land', 'AT');
    fireEvent.click(screen.getByRole('button', { name: 'Adresse speichern' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        street: 'Kirchstraße 12',
        city: 'Bregenz',
        zipCode: '6900',
        country: 'AT',
      })
    );
  });

  it('keeps a country typed into an older profile', () => {
    renderAddressStep('United Kingdom');
    expect(screen.getByLabelText('Land')).toHaveValue('United Kingdom');
  });
});
