export interface Event {
  id: string;
  title: string;
  description: string;
  coverImage: string;
  location: string;
  startDate: string;
  endDate: string;
  categories: string[];
  contactInfo: string;
  commission: number;
  services: string[];
  visibility: 'public' | 'logged-in' | 'approved';
  accessCode?: string;
  vendorLimit?: number;
  organizerId: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  condition?: string;
  category: string;
  images: string[];
  price: number;
  vendorId: string;
  vendorName: string;
  eventIds: string[];
  sold: boolean;
  readyForSale: boolean;
}

export interface Vendor {
  id: string;
  name: string;
  email: string;
  totalRevenue: number;
  commission: number;
  payout: number;
  paid: boolean;
}

export const mockEvents: Event[] = [
  {
    id: '1',
    title: 'Skibasar München 2025',
    description:
      'Der größte Skibasar in München! Kaufe und verkaufe gebrauchte Ski-Ausrüstung zu fairen Preisen.',
    coverImage:
      'https://images.unsplash.com/photo-1759938049570-dd3f0c2f9c8d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxza2klMjBlcXVpcG1lbnQlMjB3aW50ZXJ8ZW58MXx8fHwxNzYyOTM0NDk2fDA&ixlib=rb-4.1.0&q=80&w=1080',
    location: 'Olympiahalle München, Spiridon-Louis-Ring 21, 80809 München',
    startDate: '2025-11-20T09:00',
    endDate: '2025-11-22T18:00',
    categories: ['Ski', 'Snowboard', 'Skischuhe', 'Ski-Bekleidung', 'Zubehör'],
    contactInfo: 'info@skibasar-muenchen.de | +49 89 12345678',
    commission: 15,
    services: ['Skiservice', 'Parkplatz', 'Gastronomie'],
    visibility: 'public',
    vendorLimit: 200,
    organizerId: 'org1',
  },
  {
    id: '2',
    title: 'Herbst Flohmarkt Berlin',
    description: 'Großer Herbst-Flohmarkt mit Kleidung, Möbeln, Büchern und vielem mehr.',
    coverImage:
      'https://images.unsplash.com/photo-1710345919674-77407de09148?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtYXJrZXRwbGFjZSUyMGJhemFhciUyMGV2ZW50fGVufDF8fHx8MTc2MjkzNDQ5NXww&ixlib=rb-4.1.0&q=80&w=1080',
    location: 'Tempelhofer Feld, 12101 Berlin',
    startDate: '2025-10-15T10:00',
    endDate: '2025-10-15T17:00',
    categories: ['Kleidung', 'Möbel', 'Bücher', 'Spielzeug', 'Haushalt'],
    contactInfo: 'kontakt@flohmarkt-berlin.de',
    commission: 10,
    services: ['Imbiss', 'Getränke'],
    visibility: 'public',
    organizerId: 'org1',
  },
];

export const mockProducts: Product[] = [
  {
    id: 'p1',
    name: 'Fischer RC4 Slalom Ski 165cm',
    description: 'Hochwertige Slalom-Ski in sehr gutem Zustand. Perfekt für sportliche Fahrer.',
    condition: 'Sehr Gut',
    category: 'Ski',
    images: ['https://images.unsplash.com/photo-1759938049570-dd3f0c2f9c8d?w=400'],
    price: 249.99,
    vendorId: 'v1',
    vendorName: 'Max Mustermann',
    eventIds: ['1'],
    sold: false,
    readyForSale: true,
  },
  {
    id: 'p2',
    name: 'Atomic Snowboard 158cm',
    description: 'Freestyle Snowboard, ideal für Park und Pipe.',
    condition: 'Gut',
    category: 'Snowboard',
    images: ['https://images.unsplash.com/photo-1759938049570-dd3f0c2f9c8d?w=400'],
    price: 189.0,
    vendorId: 'v1',
    vendorName: 'Max Mustermann',
    eventIds: ['1'],
    sold: false,
    readyForSale: false,
  },
  {
    id: 'p3',
    name: 'Salomon Skischuhe Größe 42',
    description: 'Bequeme Skischuhe mit guter Passform.',
    condition: 'Neu',
    category: 'Skischuhe',
    images: ['https://images.unsplash.com/photo-1759938049570-dd3f0c2f9c8d?w=400'],
    price: 129.99,
    vendorId: 'v2',
    vendorName: 'Anna Schmidt',
    eventIds: ['1'],
    sold: true,
    readyForSale: true,
  },
];

export const mockVendors: Vendor[] = [
  {
    id: 'v1',
    name: 'Max Mustermann',
    email: 'max@example.com',
    totalRevenue: 438.99,
    commission: 65.85,
    payout: 373.14,
    paid: false,
  },
  {
    id: 'v2',
    name: 'Anna Schmidt',
    email: 'anna@example.com',
    totalRevenue: 129.99,
    commission: 19.5,
    payout: 110.49,
    paid: true,
  },
  {
    id: 'v3',
    name: 'Peter Weber',
    email: 'peter@example.com',
    totalRevenue: 350.0,
    commission: 52.5,
    payout: 297.5,
    paid: false,
  },
];

// export const categories = [
//   { value: 'ski', label: 'Ski' },
//   { value: 'snowboard', label: 'Snowboard' },
//   { value: 'skischuhe', label: 'Skischuhe' },
//   { value: 'ski-bekleidung', label: 'Ski-Bekleidung' },
//   { value: 'zubehoer', label: 'Zubehör' },
//   { value: 'kleidung', label: 'Kleidung' },
//   { value: 'moebel', label: 'Möbel' },
//   { value: 'buecher', label: 'Bücher' },
//   { value: 'spielzeug', label: 'Spielzeug' },
//   { value: 'haushalt', label: 'Haushalt' },
// ];

// export const conditions = [
//   { value: 'neu', label: 'Neu' },
//   { value: 'sehr-gut', label: 'Sehr Gut' },
//   { value: 'gut', label: 'Gut' },
//   { value: 'akzeptabel', label: 'Akzeptabel' },
// ];
