import { PRESET_NAMES, DIM_KEYS, type Metrics } from './neighbourhood.js';
export type FieldError = { field: string; message: string };
export interface Parsed {
  property?: { askingPrice: number; bedrooms?: number; bathrooms?: number; parking?: number; floorAreaM2?: number; erfM2?: number; ratesMonthly?: number; levyMonthly?: number; propertyType?: string; titleType?: 'freehold' | 'sectional' | 'unknown'; suburb?: string; city?: string; title?: string; features: string[] };
  url?: string; html?: string;
  buyer: { profile?: 'first_time' | 'investor' | 'upgrader'; depositPercent?: number; interestRate?: number; termYears?: number; grossMonthlyIncome?: number; expectedMonthlyRent?: number; vatSale?: boolean };
  marketData?: 'supplied' | 'provider';
  comparables: { price: number; floorAreaM2?: number; erfM2?: number; bedrooms?: number; propertyType?: string; priceType?: 'sold' | 'asking'; soldDate?: string; address?: string }[];
  neighbourhood?: { location?: { lat: number; lng: number }; priorities?: string | Record<string, number>; metrics: Metrics; osm?: boolean };
  rentalComparables: { monthlyRent: number; floorAreaM2?: number; bedrooms?: number; propertyType?: string; listedDate?: string; address?: string }[];
}

/** Strict validation: unknown fields are rejected so typos never silently change a decision. */
export function parseRequest(b: any): { value?: Parsed; errors?: FieldError[] } {
  const errors: FieldError[] = [];
  const bad = (field: string, message: string) => { errors.push({ field, message }); };
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { errors: [{ field: 'body', message: 'must be a JSON object' }] };
  const obj = (v: unknown, path: string) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as any) : (bad(path, 'must be an object'), {}));
  const only = (o: any, keys: string[], path: string) => { for (const k of Object.keys(o)) if (!keys.includes(k)) bad(path ? `${path}.${k}` : k, 'unknown field'); };
  const num = (o: any, k: string, min: number, max: number, path: string, req = false, int = false) => {
    const v = o[k], f = path ? `${path}.${k}` : k;
    if (v === undefined || v === null) { if (req) bad(f, 'is required'); return undefined; }
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (int && !Number.isInteger(v))) { bad(f, `must be ${int ? 'an integer' : 'a number'} between ${min} and ${max}`); return undefined; }
    return v;
  };
  const str = (o: any, k: string, max: number, path: string) => {
    const v = o[k]; if (v === undefined || v === null) return undefined;
    if (typeof v !== 'string' || !v.trim() || v.length > max) { bad(`${path}.${k}`, `must be a non-empty string up to ${max} characters`); return undefined; }
    return v.trim();
  };
  only(b, ['property', 'url', 'html', 'buyer', 'comparables', 'rentalComparables', 'neighbourhood', 'marketData'], '');
  if ((b.property !== undefined) === (b.url !== undefined)) bad('body', 'provide exactly one of "property" or "url"');
  const out: Parsed = { buyer: {}, comparables: [], rentalComparables: [] };
  if (b.property !== undefined) {
    const P = obj(b.property, 'property');
    only(P, ['askingPrice', 'bedrooms', 'bathrooms', 'parking', 'floorAreaM2', 'erfM2', 'ratesMonthly', 'levyMonthly', 'propertyType', 'titleType', 'suburb', 'city', 'title', 'features'], 'property');
    const t = P.titleType; if (t !== undefined && !['freehold', 'sectional', 'unknown'].includes(t)) bad('property.titleType', 'must be freehold, sectional or unknown');
    if (P.features !== undefined && (!Array.isArray(P.features) || P.features.length > 30 || P.features.some((f: unknown) => typeof f !== 'string' || f.length > 40))) bad('property.features', 'must be an array of up to 30 short strings');
    out.property = { askingPrice: num(P, 'askingPrice', 50_000, 200_000_000, 'property', true)!, bedrooms: num(P, 'bedrooms', 0, 50, 'property', false, true), bathrooms: num(P, 'bathrooms', 0, 50, 'property'), parking: num(P, 'parking', 0, 100, 'property', false, true), floorAreaM2: num(P, 'floorAreaM2', 1, 100_000, 'property'), erfM2: num(P, 'erfM2', 1, 10_000_000, 'property'), ratesMonthly: num(P, 'ratesMonthly', 0, 1_000_000, 'property'), levyMonthly: num(P, 'levyMonthly', 0, 1_000_000, 'property'), propertyType: str(P, 'propertyType', 40, 'property'), titleType: t, suburb: str(P, 'suburb', 80, 'property'), city: str(P, 'city', 80, 'property'), title: str(P, 'title', 200, 'property'), features: Array.isArray(P.features) ? P.features : [] };
  } else if (b.url !== undefined) {
    if (typeof b.url !== 'string' || b.url.length > 2000) bad('url', 'must be a URL string up to 2000 characters'); else out.url = b.url;
    if (b.html !== undefined && (typeof b.html !== 'string' || b.html.length > 1_500_000)) bad('html', 'must be a string up to 1.5 MB'); else out.html = b.html;
  }
  if (b.buyer !== undefined) {
    const B = obj(b.buyer, 'buyer');
    only(B, ['profile', 'depositPercent', 'interestRate', 'termYears', 'grossMonthlyIncome', 'expectedMonthlyRent', 'vatSale'], 'buyer');
    if (B.profile !== undefined && !['first_time', 'investor', 'upgrader'].includes(B.profile)) bad('buyer.profile', 'must be first_time, investor or upgrader');
    if (B.vatSale !== undefined && typeof B.vatSale !== 'boolean') bad('buyer.vatSale', 'must be a boolean');
    out.buyer = { profile: B.profile, depositPercent: num(B, 'depositPercent', 0, 99, 'buyer'), interestRate: num(B, 'interestRate', 1, 30, 'buyer'), termYears: num(B, 'termYears', 1, 30, 'buyer', false, true), grossMonthlyIncome: num(B, 'grossMonthlyIncome', 1, 100_000_000, 'buyer'), expectedMonthlyRent: num(B, 'expectedMonthlyRent', 1, 10_000_000, 'buyer'), vatSale: B.vatSale };
  }
  if (b.comparables !== undefined) {
    if (!Array.isArray(b.comparables) || b.comparables.length > 50) bad('comparables', 'must be an array of up to 50 items');
    else b.comparables.forEach((c: unknown, i: number) => {
      const path = `comparables.${i}`, C = obj(c, path);
      only(C, ['price', 'floorAreaM2', 'erfM2', 'bedrooms', 'propertyType', 'priceType', 'soldDate', 'address', 'sourceUrl', 'suburb'], path);
      if (C.priceType !== undefined && C.priceType !== 'sold' && C.priceType !== 'asking') bad(`${path}.priceType`, 'must be sold or asking');
      if (C.soldDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(C.soldDate)) bad(`${path}.soldDate`, 'must be YYYY-MM-DD');
      out.comparables.push({ price: num(C, 'price', 100_000, 200_000_000, path, true)!, floorAreaM2: num(C, 'floorAreaM2', 1, 100_000, path), erfM2: num(C, 'erfM2', 1, 10_000_000, path), bedrooms: num(C, 'bedrooms', 0, 50, path, false, true), propertyType: str(C, 'propertyType', 40, path), priceType: C.priceType, soldDate: C.soldDate, address: str(C, 'address', 200, path) });
    });
  }
  if (b.rentalComparables !== undefined) {
    if (!Array.isArray(b.rentalComparables) || b.rentalComparables.length > 50) bad('rentalComparables', 'must be an array of up to 50 items');
    else b.rentalComparables.forEach((c: unknown, i: number) => {
      const path = `rentalComparables.${i}`, C = obj(c, path);
      only(C, ['monthlyRent', 'floorAreaM2', 'bedrooms', 'propertyType', 'listedDate', 'address', 'sourceUrl', 'suburb'], path);
      if (C.listedDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(C.listedDate)) bad(`${path}.listedDate`, 'must be YYYY-MM-DD');
      out.rentalComparables.push({ monthlyRent: num(C, 'monthlyRent', 500, 1_000_000, path, true)!, floorAreaM2: num(C, 'floorAreaM2', 1, 100_000, path), bedrooms: num(C, 'bedrooms', 0, 50, path, false, true), propertyType: str(C, 'propertyType', 40, path), listedDate: C.listedDate, address: str(C, 'address', 200, path) });
    });
  }
  if (b.marketData !== undefined) { if (b.marketData === 'supplied' || b.marketData === 'provider') out.marketData = b.marketData; else bad('marketData', 'must be supplied or provider'); }
  if (b.neighbourhood !== undefined) {
    const N = obj(b.neighbourhood, 'neighbourhood'), nb: NonNullable<Parsed['neighbourhood']> = { metrics: {} };
    only(N, ['location', 'priorities', 'metrics', 'osm'], 'neighbourhood');
    if (N.location !== undefined) {
      const C = obj(N.location, 'neighbourhood.location'); only(C, ['lat', 'lng'], 'neighbourhood.location');
      const lat = num(C, 'lat', -35.5, -21.5, 'neighbourhood.location', true), lng = num(C, 'lng', 16, 33.5, 'neighbourhood.location', true);
      if (lat !== undefined && lng !== undefined) nb.location = { lat, lng };
    }
    const P = N.priorities;
    if (typeof P === 'string') { if (PRESET_NAMES.includes(P)) nb.priorities = P; else bad('neighbourhood.priorities', `must be one of ${PRESET_NAMES.join(', ')} or an object of weights`); }
    else if (P !== undefined) {
      const O = obj(P, 'neighbourhood.priorities'), w: Record<string, number> = {};
      for (const k of Object.keys(O)) { if (!DIM_KEYS.includes(k)) bad(`neighbourhood.priorities.${k}`, 'unknown dimension'); else { const v = num(O, k, 0, 5, 'neighbourhood.priorities'); if (v !== undefined) w[k] = v; } }
      nb.priorities = w;
    }
    if (N.metrics !== undefined) {
      const M = obj(N.metrics, 'neighbourhood.metrics'), p = 'neighbourhood.metrics'; only(M, ['crimePer100k', 'benchmarkCrimePer100k', 'priceGrowth5yPercent', 'medianDaysOnMarket'], p);
      nb.metrics = { crimePer100k: num(M, 'crimePer100k', 0, 1_000_000, p), benchmarkCrimePer100k: num(M, 'benchmarkCrimePer100k', 1, 1_000_000, p), priceGrowth5yPercent: num(M, 'priceGrowth5yPercent', -90, 1000, p), medianDaysOnMarket: num(M, 'medianDaysOnMarket', 0, 1000, p) };
    }
    if (N.osm !== undefined) { if (typeof N.osm === 'boolean') nb.osm = N.osm; else bad('neighbourhood.osm', 'must be a boolean'); }
    out.neighbourhood = nb;
  }
  return errors.length ? { errors } : { value: out };
}
