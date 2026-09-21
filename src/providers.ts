import type { Parsed } from './validate.js';

export interface MarketQuery { city?: string; suburb?: string; propertyType?: string; bedrooms?: number; floorAreaM2?: number; erfM2?: number; lat?: number; lng?: number }
export type MarketProvider = (q: MarketQuery) => Promise<{ sales: unknown[]; rentals: unknown[] }>;
export interface MarketMeta { source: 'supplied' | 'provider' | 'none'; status: 'ok' | 'empty' | 'unavailable' | 'not_configured'; salesReceived: number; rentalsReceived: number }

/**
 * Plug any licensed data source (Lightstone, Windeed, your own database) in behind one HTTP endpoint.
 * POST MarketQuery -> { sales: [{ price, floorAreaM2?, erfM2?, bedrooms?, propertyType?, priceType: "sold"|"asking", soldDate? }], rentals: [{ monthlyRent, floorAreaM2?, bedrooms?, propertyType?, listedDate? }] }
 */
export const httpMarketProvider = (url: string, key?: string): MarketProvider => async q => {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(q), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`market provider ${r.status}`);
  const j: any = await r.json();
  return { sales: Array.isArray(j?.sales) ? j.sales : [], rentals: Array.isArray(j?.rentals) ? j.rentals : [] };
};

const pos = (v: unknown, max = 1e9) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max ? v : undefined);
const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const text = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined);
const beds = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 50 ? v : undefined);
/** Lenient: provider rows that are unusable are dropped, never trusted. Missing priceType is treated as asking (the weaker evidence). */
export const coerceSales = (a: unknown[]): Parsed['comparables'] => a.flatMap((c: any) => {
  const price = pos(c?.price, 200_000_000);
  return price && price >= 100_000 ? [{ price, floorAreaM2: pos(c.floorAreaM2, 100_000), erfM2: pos(c.erfM2, 1e7), bedrooms: beds(c.bedrooms), propertyType: text(c.propertyType, 40), priceType: c.priceType === 'sold' ? 'sold' as const : 'asking' as const, soldDate: date(c.soldDate), address: text(c.address, 200) }] : [];
});
export const coerceRentals = (a: unknown[]): Parsed['rentalComparables'] => a.flatMap((c: any) => {
  const monthlyRent = pos(c?.monthlyRent, 1_000_000);
  return monthlyRent && monthlyRent >= 500 ? [{ monthlyRent, floorAreaM2: pos(c.floorAreaM2, 100_000), bedrooms: beds(c.bedrooms), propertyType: text(c.propertyType, 40), listedDate: date(c.listedDate), address: text(c.address, 200) }] : [];
});
