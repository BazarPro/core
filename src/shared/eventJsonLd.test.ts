import { describe, expect, it } from 'vitest';
import {
  eventJsonLd,
  eventTown,
  formatEventPlace,
  placeFromLocation,
  placeOf,
} from './eventJsonLd';

describe('placeFromLocation', () => {
  it('structures venue, street, postal code and town', () => {
    expect(placeFromLocation('Gemeindehaus St. Martin, Hauptstr. 5, 89073 Ulm')).toEqual({
      '@type': 'Place',
      name: 'Gemeindehaus St. Martin',
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Hauptstr. 5',
        postalCode: '89073',
        addressLocality: 'Ulm',
        addressCountry: 'DE',
      },
    });
  });

  it('keeps the whole text as name when there is no venue', () => {
    const place = placeFromLocation('Hauptstr. 5\nD-89073 Ulm (Donau)');
    expect(place.name).toBe('Hauptstr. 5\nD-89073 Ulm (Donau)');
    expect(place.address).toMatchObject({
      streetAddress: 'Hauptstr. 5',
      postalCode: '89073',
      addressLocality: 'Ulm (Donau)',
    });
  });

  it('takes a venue without house number as name', () => {
    expect(placeFromLocation('Turnhalle Nord, 89073 Ulm')).toMatchObject({
      name: 'Turnhalle Nord',
      address: { postalCode: '89073', addressLocality: 'Ulm' },
    });
  });

  it('leaves text without German postal code as it is', () => {
    expect(placeFromLocation('Ulm')).toEqual({ '@type': 'Place', name: 'Ulm', address: 'Ulm' });
    expect(placeFromLocation('Halle 12345')).toMatchObject({ address: 'Halle 12345' });
    expect(placeFromLocation('Hauptplatz 1, 6020 Innsbruck')).toMatchObject({
      address: 'Hauptplatz 1, 6020 Innsbruck',
    });
  });
});

describe('eventJsonLd', () => {
  it('builds a schema.org event with image', () => {
    expect(
      eventJsonLd({
        title: 'Fahrradbasar',
        description: 'Räder',
        location: 'Ulm',
        startDate: Date.UTC(2026, 10, 7, 9),
        endDate: Date.UTC(2026, 10, 7, 15),
        url: 'https://bazarpro.de/public-events/evt1',
        image: 'https://bazarpro.de/og-image.png',
      })
    ).toMatchObject({
      '@type': 'Event',
      startDate: '2026-11-07T09:00:00.000Z',
      location: { name: 'Ulm' },
      image: ['https://bazarpro.de/og-image.png'],
    });
  });
});

describe('placeOf', () => {
  it('prefers the address organizers entered', () => {
    expect(
      placeOf({
        location: 'Turnhalle Nord',
        street: 'Hauptstr. 5',
        postalCode: '89073',
        city: 'Ulm',
      })
    ).toEqual({
      '@type': 'Place',
      name: 'Turnhalle Nord',
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Hauptstr. 5',
        postalCode: '89073',
        addressLocality: 'Ulm',
        addressCountry: 'DE',
      },
    });
  });

  it('parses the location of events without address', () => {
    expect(placeOf({ location: 'Halle, 89073 Ulm', street: 'Weg 1' })).toMatchObject({
      address: { postalCode: '89073', addressLocality: 'Ulm' },
    });
  });
});

describe('formatEventPlace and eventTown', () => {
  it('joins venue and address without repeating parts', () => {
    const event = {
      location: 'Turnhalle Nord',
      street: 'Hauptstr. 5',
      postalCode: '89073',
      city: 'Ulm',
    };
    expect(formatEventPlace(event)).toBe('Turnhalle Nord, Hauptstr. 5, 89073 Ulm');
    expect(formatEventPlace({ ...event, location: 'Turnhalle Nord, Hauptstr. 5' })).toBe(
      'Turnhalle Nord, Hauptstr. 5, 89073 Ulm'
    );
    expect(formatEventPlace({ location: 'Ulm' })).toBe('Ulm');
    expect(eventTown(event)).toBe('Ulm');
    expect(eventTown({ location: 'Halle Ulm', city: ' ' })).toBe('Halle Ulm');
  });
});
