import type { Cat, Poi, Provider } from './neighbourhood.js';

const hav = (a: number, b: number, c: number, d: number) => {
  const t = (x: number) => (x * Math.PI) / 180, h = Math.sin(t(c - a) / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(t(d - b) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
};
export const catOf = (t: Record<string, string>): Cat | undefined =>
  t.shop === 'supermarket' || t.shop === 'convenience' ? 'grocery'
  : t.amenity === 'pharmacy' ? 'pharmacy'
  : ['restaurant', 'cafe'].includes(t.amenity) ? 'eatery'
  : ['bar', 'pub'].includes(t.amenity) ? 'nightlife'
  : ['theatre', 'cinema', 'arts_centre'].includes(t.amenity) || ['museum', 'gallery'].includes(t.tourism) ? 'culture'
  : ['park', 'garden', 'playground', 'nature_reserve'].includes(t.leisure) ? 'park'
  : ['school', 'kindergarten', 'college', 'university'].includes(t.amenity) ? 'school'
  : ['clinic', 'doctors', 'hospital', 'dentist'].includes(t.amenity) ? 'health'
  : t.highway === 'bus_stop' || t.amenity === 'bus_station' || t.amenity === 'taxi' ? 'transit'
  : ['station', 'halt', 'tram_stop'].includes(t.railway) ? 'station'
  : ['police', 'fire_station'].includes(t.amenity) ? 'safety' : undefined;

export function parseOverpass(json: any, lat: number, lng: number): Poi[] {
  const out: Poi[] = [];
  for (const e of json?.elements ?? []) {
    const cat = catOf(e.tags ?? {}), la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon;
    if (cat && typeof la === 'number' && typeof lo === 'number') out.push({ cat, d: Math.round(hav(lat, lng, la, lo)), label: cat === 'safety' ? (e.tags.amenity === 'police' ? 'Police station' : 'Fire station') : undefined });
  }
  return out;
}
export const overpassQuery = (lat: number, lng: number) => {
  const a = `around:1500,${lat},${lng}`;
  return `[out:json][timeout:20];(nwr(${a})[shop~"^(supermarket|convenience)$"];nwr(${a})[amenity~"^(pharmacy|restaurant|cafe|bar|pub|theatre|cinema|arts_centre|school|kindergarten|college|university|clinic|doctors|hospital|dentist|bus_station|taxi|police|fire_station)$"];nwr(${a})[leisure~"^(park|garden|playground|nature_reserve)$"];nwr(${a})[highway=bus_stop];nwr(${a})[railway~"^(station|halt|tram_stop)$"];nwr(${a})[tourism~"^(museum|gallery)$"];);out center tags 800;`;
};

const cache = new Map<string, { at: number; pois: Poi[] }>();
/** OpenStreetMap via Overpass. Public endpoint is rate limited: self-host or use a paid endpoint (OVERPASS_URL) in production. */
export const osmProvider: Provider = async (lat, lng) => {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`, hit = cache.get(key);
  if (hit && Date.now() - hit.at < 86_400_000) return hit.pois;
  const r = await fetch(process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter', { method: 'POST', body: new URLSearchParams({ data: overpassQuery(lat, lng) }), headers: { 'user-agent': process.env.OSM_USER_AGENT ?? 'eix-property-decision-api/1.0' }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`Overpass ${r.status}`);
  const pois = parseOverpass(await r.json(), lat, lng);
  cache.set(key, { at: Date.now(), pois }); if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return pois;
};
