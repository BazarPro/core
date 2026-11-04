import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';
import { EditEventAccess } from './EditEventAccess';

function Form({ visibility }: { visibility: string }) {
  const methods = useForm({ defaultValues: { visibility, accessCode: '' } });
  return (
    <FormProvider {...methods}>
      <EditEventAccess />
    </FormProvider>
  );
}

describe('EditEventAccess', () => {
  it('explains the setting for events reached by link and code', () => {
    render(<Form visibility="approved" />);
    expect(screen.getByTestId('link-only-help')).toBeTruthy();
  });

  it('shows no such explanation for public events', () => {
    render(<Form visibility="public" />);
    expect(screen.queryByTestId('link-only-help')).toBeNull();
  });
});
