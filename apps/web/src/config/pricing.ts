export type Product = 'open_mic' | 'artist' | 'label' | 'industry' | 'demo';

export interface Plan {
  id: Product;
  name: string;
  price: number;
  period: string;
  credits: number;
  description: string;
  cta: string;
  featured: boolean;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: 'open_mic',
    name: 'Open Mic',
    price: 15,
    period: 'one-time',
    credits: 40,
    description: 'One-time credits to try pro lip-sync.',
    cta: 'Re-Up On Credits',
    featured: false,
    features: ['3–9 second videos', '1 credit = 1 second', '40 one-time credits', 'Watermarked downloads', 'Lip-sync + audio'],
  },
  {
    id: 'artist',
    name: 'Artist',
    price: 20,
    period: '/mo',
    credits: 80,
    description: 'Steady output for growing artists.',
    cta: 'Re-Up On Credits',
    featured: false,
    features: ['3–9 second videos', '1 credit = 1 second', '80 credits per month', 'Watermarked downloads', 'Lip-sync + audio'],
  },
  {
    id: 'label',
    name: 'Label',
    price: 50,
    period: '/mo',
    credits: 330,
    description: 'High volume for labels and serious creators.',
    cta: 'Re-Up On Credits',
    featured: true,
    features: ['3–9 second videos', '1 credit = 1 second', '330 credits per month', 'Watermarked downloads', 'Lip-sync + audio', 'High volume for serious creators'],
  },
  {
    id: 'industry',
    name: 'Industry',
    price: 199,
    period: '/mo',
    credits: 1000,
    description: 'Professional tier for AI artist label deals.',
    cta: 'Re-Up On Credits',
    featured: false,
    features: ['Up to 90 second videos', '1 credit = 1 second', '1000 credits per month', 'Auto-segmentation', 'No watermarks', 'Priority processing'],
  },
  {
    id: 'demo',
    name: 'DEMO',
    price: 0,
    period: '/day',
    credits: 20,
    description: 'Investor demo tier - 20 credits per day (no rollover).',
    cta: 'Enroll',
    featured: false,
    features: ['Up to 20 second videos', '1 credit = 1 second', '20 credits per day', 'Tempo-based scene calculation', 'Multi-image support', 'No watermarks'],
  },
];
