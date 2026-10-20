import { fireEvent, render, screen } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { EditEventBasicInfo } from './EditEventBasicInfo';

function Form({ lockDates = false, description = '' }) {
  const methods = useForm({ defaultValues: { title: '', description, location: '' } });
  return (
    <FormProvider {...methods}>
      <EditEventBasicInfo lockDates={lockDates} />
    </FormProvider>
  );
}

const description = () => document.getElementById('description') as HTMLTextAreaElement;

describe('EditEventBasicInfo', () => {
  it('formats the description with the toolbar', () => {
    render(<Form description="Räder" />);
    const formats: [string, string][] = [
      ['Fett', '**Räder**'],
      ['Kursiv', '*Räder*'],
      ['Liste', '- Räder'],
      ['Link', '[Räder](https://example.com)'],
      ['H2', '## Räder'],
      ['H3', '### Räder'],
      ['Absatz', '\n\nRäder\n\n'],
    ];
    for (const [button, expected] of formats) {
      fireEvent.change(description(), { target: { value: 'Räder' } });
      description().setSelectionRange(0, 5);
      fireEvent.click(screen.getByRole('button', { name: button }));
      expect(description()).toHaveValue(expected);
    }
  });

  it('indents with Tab and shows a preview', () => {
    render(<Form description="Marktplatz" />);
    description().setSelectionRange(0, 0);
    fireEvent.keyDown(description(), { key: 'Tab' });
    expect(description()).toHaveValue('  Marktplatz');
    fireEvent.keyDown(description(), { key: 'a' });

    fireEvent.click(screen.getByRole('button', { name: 'Vorschau' }));
    expect(description()).toBeNull();
    expect(screen.getByText('Marktplatz')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }));
    expect(description()).not.toBeNull();
  });

  it('says so when the preview has nothing to show', () => {
    render(<Form />);
    fireEvent.click(screen.getByRole('button', { name: 'Vorschau' }));
    expect(screen.getByText(/Noch keine Beschreibung vorhanden/)).toBeInTheDocument();
  });

  it('locks the dates of a running event', () => {
    render(<Form lockDates />);
    expect(document.getElementById('startDate')).toHaveAttribute('readonly');
    expect(document.getElementById('endDate')).toHaveAttribute('readonly');
  });
});
