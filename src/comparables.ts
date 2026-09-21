import { render, parseListing } from './extract.js';
import { allowedUrl } from './hosts.js';

export interface ExtractItem { url: string; html?: string }
/**
 * Turns public listing pages into comparables you can feed straight back into /v1/decisions.
 * Listing pages carry ASKING prices and rents, so they are labelled priceType "asking" and weighted lower than sold prices.
 * Check each portal's terms before automating this.
 */
export async function extractComparables(items: ExtractItem[], renderFn: typeof render = render) {
  const sales: object[] = [], rentals: object[] = [], skipped: { url: string; reason: string }[] = [];
  let renders = 0;
  for (const it of items) {
    if (!allowedUrl(it.url)) { skipped.push({ url: it.url, reason: 'URL_NOT_ALLOWED' }); continue; }
    let html = it.html;
    if (html === undefined) {
      if (renders >= 5) { skipped.push({ url: it.url, reason: 'RENDER_LIMIT' }); continue; }
      renders++;
      try { html = await renderFn(it.url, h => !!allowedUrl(h)); } catch { skipped.push({ url: it.url, reason: 'LOAD_FAILED' }); continue; }
    }
    const L = parseListing(html, it.url), base = { sourceUrl: it.url, floorAreaM2: L.floorSqm, erfM2: L.erfSqm, bedrooms: L.beds, propertyType: L.propertyType, suburb: L.suburb };
    if (L.listing === 'rental' && L.rent) rentals.push({ ...base, monthlyRent: L.rent });
    else if (L.price) sales.push({ ...base, price: L.price, priceType: 'asking' });
    else skipped.push({ url: it.url, reason: 'NO_PRICE_FOUND' });
  }
  return { sales, rentals, skipped };
}
