import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Id } from '../../../../lib/api/types';
import { LandingEventsSection, type LandingEvent } from './LandingEventsSection';

vi.mock('../../../../components/ui/image-with-fallback', () => ({
  ImageWithFallback: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

const DAY = 24 * 60 * 60 * 1000;
const event = (id: string, title: string, offsetDays: number): LandingEvent => ({
  _id: id as Id<'events'>,
  title,
  description: '**Gebrauchte** Kindersachen',
  startDate: Date.now() + offsetDays * DAY,
  endDate: Date.now() + offsetDays * DAY + 5 * 60 * 60 * 1000,
  location: 'Gemeindehaus',
});

function renderSection(events: LandingEvent[], includePast = false) {
  const handlers = {
    onEventClick: vi.fn(),
    onIncludePastChange: vi.fn(),
    onCreateEventClick: vi.fn(),
  };
  render(<LandingEventsSection events={events} includePast={includePast} {...handlers} />);
  return handlers;
}

describe('LandingEventsSection', () => {
  beforeEach(() => {
    // jsdom has no ResizeObserver; the section uses it for the scroll buttons
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      }
    );
  });

  it('opens an event by clicking anywhere on its card', () => {
    const { onEventClick } = renderSection([event('e1', 'Herbstbasar', 3)]);
    fireEvent.click(screen.getByText('Herbstbasar'));
    fireEvent.click(screen.getByText('Gemeindehaus'));
    expect(onEventClick).toHaveBeenCalledTimes(2);
    expect(onEventClick).toHaveBeenCalledWith('e1');
  });

  it('the button opens the event exactly once', () => {
    const { onEventClick } = renderSection([event('e1', 'Herbstbasar', 3)]);
    fireEvent.click(screen.getByRole('button', { name: 'Details ansehen' }));
    expect(onEventClick).toHaveBeenCalledTimes(1);
  });

  it('marks past events and shows the description without Markdown', () => {
    renderSection([event('e1', 'Frühjahrsbasar', -30), event('e2', 'Herbstbasar', 3)], true);
    expect(screen.getAllByText('BEENDET')).toHaveLength(1);
    expect(screen.getAllByText('Gebrauchte Kindersachen')).toHaveLength(2);
  });

  it('without events: hint and button to create one, depending on the past filter', () => {
    const { onCreateEventClick, onIncludePastChange } = renderSection([]);
    expect(screen.getByText('Gerade sind keine öffentlichen Basare geplant')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Basar anlegen' }));
    expect(onCreateEventClick).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onIncludePastChange).toHaveBeenCalledWith(true);
  });

  it('with past events included and none found', () => {
    renderSection([], true);
    expect(screen.getByText('Keine Veranstaltungen gefunden')).toBeInTheDocument();
  });
});
