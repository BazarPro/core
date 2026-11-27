import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InfoTip, LabelWithInfo } from './info-tip';

function placeButton(rect: Partial<DOMRect>) {
  const button = screen.getByRole('button', { name: 'Mehr erfahren' });
  button.getBoundingClientRect = () =>
    ({ left: 100, width: 20, top: 100, bottom: 120, ...rect }) as DOMRect;
  return button;
}

describe('the (i) beside a label', () => {
  it('opens on a tap, stays open, and closes on a second tap', () => {
    render(<InfoTip>Was die Provision ist</InfoTip>);
    const button = placeButton({});
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Was die Provision ist');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAccessibleDescription('Was die Provision ist');

    fireEvent.click(button);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows on focus and on mouse hover, not on a touch', () => {
    render(<InfoTip label="Hilfe">Text</InfoTip>);
    const button = screen.getByRole('button', { name: 'Hilfe' });

    fireEvent.pointerEnter(button, { pointerType: 'touch' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.pointerEnter(button, { pointerType: 'mouse' });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.pointerLeave(button, { pointerType: 'mouse' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    fireEvent.focus(button);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.blur(button);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('closes with Escape and a tap elsewhere, but not with other keys', () => {
    render(<InfoTip>Text</InfoTip>);
    const button = placeButton({});
    fireEvent.click(button);

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    fireEvent.click(button);
    fireEvent.pointerDown(button);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('opens above the button when there is little room below', () => {
    render(<InfoTip>Text</InfoTip>);
    const button = placeButton({ top: window.innerHeight - 60, bottom: window.innerHeight - 40 });
    fireEvent.click(button);
    expect(screen.getByRole('tooltip')).toHaveClass('-translate-y-full');

    fireEvent.scroll(window);
    fireEvent(window, new Event('resize'));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('keeps a click inside a label from toggling its checkbox', () => {
    render(
      <label>
        <input type="checkbox" />
        Option <InfoTip>Text</InfoTip>
      </label>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mehr erfahren' }));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });
});

describe('a label with its explanation', () => {
  it('has an (i) only when there is something to explain', () => {
    const { rerender } = render(
      <LabelWithInfo htmlFor="fee" info="Pro Artikel">
        Gebühr
      </LabelWithInfo>
    );
    expect(screen.getByText('Gebühr')).toHaveAttribute('for', 'fee');
    expect(screen.getByRole('button', { name: 'Mehr erfahren' })).toBeInTheDocument();

    rerender(<LabelWithInfo>Gebühr</LabelWithInfo>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
