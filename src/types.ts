export type Src = 'jsonld' | 'text' | 'llm' | 'user';
export interface Listing {
  url: string; captureMode?: 'browser' | 'supplied_html'; province?: string; status?: 'under_offer'; listingNumber?: string; listedDate?: string; streetAddress?: string; agency?: string; agentName?: string; receptionRooms?: number; pois?: { category: string; name: string; distanceKm: number }[]; portalCalc?: { monthly?: number; onceOff?: number; minIncome?: number }; recentSales?: { address: string; url?: string }[]; signals?: import('./signals.js').Signal[]; claims?: import('./signals.js').Claims; listing?: 'sale' | 'rental'; rent?: number; lat?: number; lng?: number; image?: string; city?: string; title?: string; suburb?: string; propertyType?: string;
  price?: number; beds?: number; baths?: number; parking?: number;
  floorSqm?: number; erfSqm?: number; levy?: number; rates?: number;
  titleType: 'freehold' | 'sectional' | 'unknown';
  features: string[];
  /** where each field came from, so the report can separate listing facts from estimates */
  src: Record<string, Src>;
}
export interface Comp { price: number; floorSqm?: number; erfSqm?: number; beds?: number; propertyType?: string; kind?: 'sold' | 'asking'; date?: string; address?: string }
export interface Profile {
  buyer: 'first-time' | 'investor' | 'upgrader';
  depositPct: number; rate: number; termYears: number;
  grossIncome?: number; monthlyRent?: number; vatSale?: boolean; city?: 'ct';
}
