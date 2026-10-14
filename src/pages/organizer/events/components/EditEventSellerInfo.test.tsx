import { fireEvent, render, screen } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { EditEventSellerInfo } from './EditEventSellerInfo';
import { logisticsFromForm } from '../../../../lib/sellerLogistics';

function Form() {
  const methods = useForm({
    defaultValues: {
      title: 'Kinderbasar',
      location: 'Turnhalle',
      startDate: '2026-10-17T09:00',
      endDate: '2026-10-17T13:00',
      contactInfo: 'basar@verein.de',
      sellerLogistics: {
        dropoffStart: '',
        dropoffEnd: '',
        pickupStart: '',
        pickupEnd: '',
        note: '',
      },
    },
  });
  return (
    <FormProvider {...methods}>
      <EditEventSellerInfo />
    </FormProvider>
  );
}

describe('EditEventSellerInfo', () => {
  it('previews the mail of the evening before with the entered times and note', () => {
    render(<Form />);
    fireEvent.change(screen.getByLabelText('Abgabe ab (optional)'), {
      target: { value: '2026-10-16T16:00' },
    });
    fireEvent.change(screen.getByLabelText('Abgabe bis (optional)'), {
      target: { value: '2026-10-16T18:00' },
    });
    fireEvent.change(screen.getByLabelText('Hinweis für Verkäufer (optional)'), {
      target: { value: 'Eingang über den Hof' },
    });
    fireEvent.click(screen.getByText('Vorschau der Mail am Vorabend'));
    expect(screen.getByText('Betreff: Bald ist es so weit: Kinderbasar')).toBeInTheDocument();
    expect(screen.getByText('Eingang über den Hof')).toBeInTheDocument();
    expect(
      screen.getByText(/^Bring deine Artikel zur Abgabe: Freitag, 16\. Oktober 2026/)
    ).toBeInTheDocument();
    expect(
      screen.getByText('Fragen? Der Veranstalter ist erreichbar unter: basar@verein.de')
    ).toBeInTheDocument();
  });

  it('leaves out empty fields', () => {
    expect(
      logisticsFromForm({
        dropoffStart: '',
        dropoffEnd: '',
        pickupStart: '',
        pickupEnd: '',
        note: '  ',
      })
    ).toEqual({
      dropoffStart: undefined,
      dropoffEnd: undefined,
      pickupStart: undefined,
      pickupEnd: undefined,
      note: undefined,
    });
  });
});
