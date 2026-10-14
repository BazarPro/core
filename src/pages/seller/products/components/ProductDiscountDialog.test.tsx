import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProductDiscountDialog } from './ProductDiscountDialog';

function renderDialog(props: Partial<Parameters<typeof ProductDiscountDialog>[0]> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <ProductDiscountDialog
      open
      onOpenChange={() => {}}
      productTitle="Trekkingrad"
      originalPrice={200}
      currentDiscount={0}
      onSave={onSave}
      isSaving={false}
      {...props}
    />
  );
  return { onSave, slider: screen.getByLabelText(/Rabatt:/) as HTMLInputElement };
}

describe('ProductDiscountDialog', () => {
  it('limits the slider to the current discount and the event maximum', () => {
    const { slider } = renderDialog({ currentDiscount: 10, maxDiscount: 30 });
    expect(slider).toHaveAttribute('min', '10');
    expect(slider).toHaveAttribute('max', '30');
    expect(slider).toHaveAttribute('step', '5');
    expect(screen.getByText(/Maximal 30% Rabatt/)).toBeInTheDocument();
  });

  it('uses 1 % steps when the maximum is not a multiple of 5', () => {
    const { slider } = renderDialog({ maxDiscount: 33 });
    expect(slider).toHaveAttribute('step', '1');
  });

  it('defaults to 50 % without an event maximum', () => {
    const { slider } = renderDialog();
    expect(slider).toHaveAttribute('max', '50');
  });

  it('follows every value while dragging and updates the price', () => {
    const { slider } = renderDialog({ maxDiscount: 30 });
    // A drag fires one change event per step the thumb passes
    for (const value of ['5', '10', '15', '20']) {
      fireEvent.change(slider, { target: { value } });
      expect(slider.value).toBe(value);
      expect(screen.getByText(`Rabatt: ${value}%`)).toBeInTheDocument();
    }
    expect(screen.getByText('160,00 €')).toBeInTheDocument();
  });

  it('asks for confirmation before saving', async () => {
    const { slider, onSave } = renderDialog({ maxDiscount: 30 });
    const save = screen.getByRole('button', { name: 'Rabatt speichern' });
    expect(save).toBeDisabled();

    fireEvent.change(slider, { target: { value: '20' } });
    fireEvent.click(save);
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Ja, Rabatt anwenden' }));
    expect(onSave).toHaveBeenCalledWith(20);
  });
});
