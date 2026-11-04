import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

function renderInForm(onValueChange: (value: string) => void) {
  const { container } = render(
    <form>
      <Select value="a" onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">A</SelectItem>
          <SelectItem value="b">B</SelectItem>
        </SelectContent>
      </Select>
    </form>
  );
  return container.querySelector('select') as HTMLSelectElement;
}

describe('Select', () => {
  it('keeps its value when the hidden native select reports nothing', () => {
    const onValueChange = vi.fn();
    const native = renderInForm(onValueChange);
    fireEvent.change(native, { target: { value: '' } });
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('passes on real changes of the native select, e.g. autofill', () => {
    const onValueChange = vi.fn();
    const native = renderInForm(onValueChange);
    fireEvent.change(native, { target: { value: 'b' } });
    expect(onValueChange).toHaveBeenCalledWith('b');
  });
});
