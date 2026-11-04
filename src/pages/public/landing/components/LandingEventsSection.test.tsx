import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
    onIncludePastChange: vi.fn(),
    onCreateEventClick: vi.fn(),
  };
  render(
    <MemoryRouter>
      <LandingEventsSection events={events} includePast={includePast} {...handlers} />
    </MemoryRouter>
  );
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

  it('the whole card links to its event', () => {
    renderSection([event('e1', 'Herbstbasar', 3)]);
    expect(screen.getByRole('link', { name: /Herbstbasar/ })).toHaveAttribute(
      'href',
      '/public-events/e1'
    );
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
