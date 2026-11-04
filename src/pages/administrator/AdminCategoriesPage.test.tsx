import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFunctionName } from '../../lib/api/functions';
import { useMutation, useQuery } from '../../lib/api/react';
import { AdminCategoriesPage } from './AdminCategoriesPage';

vi.mock('../../lib/api/react', () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));

const base = { _creationTime: 1, updatedAt: 1, childCount: 0, productCount: 0, eventCount: 0 };
const bikes = {
  ...base,
  _id: 'bikes',
  label: 'Fahrräder',
  translations: { en: 'Bikes' },
  productCount: 3,
  eventCount: 1,
};
const misc = { ...base, _id: 'misc', label: 'Sonstiges', translations: {} };
const kids = {
  ...base,
  _id: 'kids',
  label: 'Kinderrad',
  translations: {},
  parentCategory: 'bikes',
};

const mutations: Record<string, ReturnType<typeof vi.fn>> = {};

beforeEach(() => {
  for (const name of Object.keys(mutations)) delete mutations[name];
  vi.mocked(useQuery).mockReturnValue([bikes, kids, misc] as never);
  vi.mocked(useMutation).mockImplementation(((fn: unknown) => {
    const name = getFunctionName(fn);
    mutations[name] ??= vi.fn(async () => null);
    return mutations[name];
  }) as never);
});

const row = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;

describe('AdminCategoriesPage', () => {
  it('shows names, inherited extra fields and usage', () => {
    render(<AdminCategoriesPage />);
    expect(within(row('Fahrräder')).getByText('Bikes')).toBeInTheDocument();
    expect(within(row('Fahrräder')).getByText('Rahmennummer')).toBeInTheDocument();
    expect(within(row('Fahrräder')).getByText('3 Artikel, 1 Basar')).toBeInTheDocument();
    expect(within(row('Kinderrad')).getByText('Unterkategorie von Fahrräder')).toBeInTheDocument();
    expect(within(row('Kinderrad')).getByText('Rahmennummer')).toBeInTheDocument();
    expect(within(row('Sonstiges')).getByText('Keine')).toBeInTheDocument();
  });

  it('sorts by name with sub-categories below their parent', () => {
    render(<AdminCategoriesPage />);
    const names = screen.getAllByRole('row').map((row) => row.querySelector('td .font-medium'));
    expect(names.flatMap((name) => name?.textContent ?? [])).toEqual([
      'Fahrräder',
      'Kinderrad',
      'Sonstiges',
    ]);
  });

  it('only offers to delete what nothing uses', () => {
    render(<AdminCategoriesPage />);
    expect(screen.getByRole('button', { name: 'Löschen: Fahrräder' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Löschen: Sonstiges' })).toBeEnabled();
  });

  it('keeps the last category', () => {
    vi.mocked(useQuery).mockReturnValue([misc] as never);
    render(<AdminCategoriesPage />);
    expect(screen.getByRole('button', { name: 'Löschen: Sonstiges' })).toBeDisabled();
  });

  it('saves the changed names and warns when the extra fields change', async () => {
    render(<AdminCategoriesPage />);
    fireEvent.click(within(row('Fahrräder')).getByRole('button', { name: 'Bearbeiten' }));
    const name = screen.getByLabelText('Name');
    expect(screen.queryByText(/ändern sich für alle Artikel/)).not.toBeInTheDocument();

    fireEvent.change(name, { target: { value: 'Allerlei' } });
    expect(screen.getByText(/ändern sich für alle Artikel/)).toBeInTheDocument();
    expect(screen.getByText(/keine Zusatzfelder/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Englischer Name'), { target: { value: ' Misc ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(mutations['categories.updateCategory']).toHaveBeenCalledWith({
        categoryId: 'bikes',
        label: 'Allerlei',
        translations: { en: 'Misc' },
      })
    );
    await waitFor(() => expect(screen.queryByLabelText('Name')).not.toBeInTheDocument());
  });

  it('creates a category, but not one with a name that exists', async () => {
    render(<AdminCategoriesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Kategorie hinzufügen' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'sonstiges' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(mutations['categories.createCategory']).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Wintersport' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(mutations['categories.createCategory']).toHaveBeenCalledWith({
        label: 'Wintersport',
        translations: { en: undefined },
      })
    );
  });
});
