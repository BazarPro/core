import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Id } from '../../../../../convex/_generated/dataModel';
import type { ProductToComplete } from '../../../../lib/productCompletion';
import { getFieldsForLabel } from '../../../../../convex/categoryFields';
import { CompleteProductsDialog } from './CompleteProductsDialog';

// Selecting files goes through react-dropzone and image processing; a button is enough here
vi.mock('../../../../components/ui/ImageUpload', () => ({
  ImageUpload: ({ onFilesChange }: { onFilesChange: (files: File[]) => void }) => (
    <button type="button" onClick={() => onFilesChange([new File(['x'], 'photo.jpg')])}>
      Foto wählen
    </button>
  ),
}));

const item = (id: string): ProductToComplete => ({
  product: { _id: id as Id<'products'>, title: id, price: 12.5, images: [] },
  missing: ['photo'],
  fields: [],
  eventTitles: ['Fahrradbörse'],
});

const frameNumber = getFieldsForLabel('Fahrräder')!.filter((field) => field.key === 'frameNumber');

function renderDialog(items = [item('Helm'), item('Schloss')]) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onFinish = vi.fn().mockResolvedValue(undefined);
  render(
    <CompleteProductsDialog items={items} onSave={onSave} onFinish={onFinish} onCancel={() => {}} />
  );
  return { onSave, onFinish };
}

describe('CompleteProductsDialog', () => {
  it('asks for a photo per item and finishes after the last one', async () => {
    const { onSave, onFinish } = renderDialog();
    expect(screen.getByText('Artikel ergänzen (1 von 2)')).toBeInTheDocument();
    expect(screen.getByText('Helm')).toBeInTheDocument();
    expect(screen.getByText(/12,50 € · fehlt: Foto/)).toBeInTheDocument();

    const save = screen.getByRole('button', { name: 'Speichern & weiter' });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Foto wählen' }));
    fireEvent.click(save);

    await screen.findByText('Artikel ergänzen (2 von 2)');
    expect(onSave).toHaveBeenCalledWith('Helm', { files: [expect.any(File)], attributes: {} });
    expect(screen.getByRole('button', { name: 'Speichern & fertig' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Foto wählen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Speichern & fertig' }));
    await waitFor(() => expect(onFinish).toHaveBeenCalledWith([]));
  });

  it('leaves skipped items out', async () => {
    const { onSave, onFinish } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Überspringen' }));
    await screen.findByText('Schloss');
    fireEvent.click(screen.getByRole('button', { name: 'Überspringen' }));
    await waitFor(() => expect(onFinish).toHaveBeenCalledWith(['Helm', 'Schloss']));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('asks for a required field such as the frame number', async () => {
    const { onSave, onFinish } = renderDialog([
      { ...item('Trekkingrad'), missing: ['field:frameNumber'], fields: frameNumber },
    ]);
    expect(screen.getByText(/fehlt: Rahmennummer/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Foto wählen' })).not.toBeInTheDocument();

    const save = screen.getByRole('button', { name: 'Speichern & fertig' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Rahmennummer'), { target: { value: 'WBK123' } });
    fireEvent.click(save);

    await waitFor(() => expect(onFinish).toHaveBeenCalledWith([]));
    expect(onSave).toHaveBeenCalledWith('Trekkingrad', {
      files: [],
      attributes: { frameNumber: 'WBK123' },
    });
  });
});
