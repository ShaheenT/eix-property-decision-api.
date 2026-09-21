import { readFileSync } from 'node:fs';
import { render, parseListing } from './extract.js';
import { osmProvider } from './osm.js';
import type { Listing } from './types.js';

export const FIELDS = ['price', 'beds', 'baths', 'floorSqm', 'erfSqm', 'rates', 'city', 'propertyType'] as const;
/** Which fields a page yielded. "core" (price or rent, bedrooms, city) is what the API cannot work without. */
export function coverage(L: Listing) {
  const has = (f: string) => (L as any)[f] !== undefined;
  const found = FIELDS.filter(has);
  return { found, missing: FIELDS.filter(f => !has(f)), core: (L.listing === 'rental' ? L.rent !== undefined : has('price')) && has('beds') && has('city') };
}

/** Live check for a machine with internet: npm run smoke -- smoke/urls.txt [--osm lat,lng]. Run nightly to catch portal layout drift. */
if (/smoke\.(ts|js)$/.test(process.argv[1] ?? '')) {
  const a = process.argv.slice(2), file = a.find(x => !x.startsWith('--')), osm = a.indexOf('--osm') >= 0 ? a[a.indexOf('--osm') + 1] : undefined;
  let failures = 0;
  for (const url of file ? readFileSync(file, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')) : []) {
    const t0 = Date.now();
    try {
      const html = await render(url), L = parseListing(html, url), c = coverage(L);
      if (html.length < 8000 && /just a moment|captcha|access denied/i.test(html)) throw new Error('blocked by the site');
      if (!c.core) failures++;
      console.log(`${c.core ? 'OK  ' : 'FAIL'} ${Date.now() - t0}ms ${url}\n     found: ${c.found.join(', ')}${c.missing.length ? `\n     missing: ${c.missing.join(', ')}` : ''}`);
    } catch (e) { failures++; console.log(`FAIL ${Date.now() - t0}ms ${url}\n     ${(e as Error).message}`); }
  }
  if (osm) {
    const [lat, lng] = osm.split(',').map(Number), t0 = Date.now();
    try {
      const pois = await osmProvider(lat, lng), counts: Record<string, number> = {};
      for (const p of pois) counts[p.cat] = (counts[p.cat] ?? 0) + 1;
      if (!pois.length) failures++;
      console.log(`${pois.length ? 'OK  ' : 'FAIL'} ${Date.now() - t0}ms OpenStreetMap ${osm}: ${JSON.stringify(counts)}`);
    } catch (e) { failures++; console.log(`FAIL OpenStreetMap: ${(e as Error).message}`); }
  }
  process.exit(failures ? 1 : 0);
}
