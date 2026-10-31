import { describe, expect, it } from 'vitest';
import { eventJsonLd, placeFromLocation } from './eventJsonLd';

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
