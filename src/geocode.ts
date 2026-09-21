export interface GeoQuery { address?: string; suburb?: string; city?: string; province?: string }
export interface GeoResult { lat: number; lng: number; precision: 'address' | 'street' | 'suburb'; matchedAs: string }
export interface GeoOutcome { status: 'ok' | 'not_found' | 'mismatch' | 'unavailable'; attempts: number; result?: GeoResult }
export type Geocoder = (q: GeoQuery) => Promise<GeoOutcome>;

const norm = (s?: string) => (s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const inSA = (lat: number, lng: number) => lat >= -35.5 && lat <= -21.5 && lng >= 16 && lng <= 33.5;

/**
 * Nominatim (OpenStreetMap) geocoder. Follows the usage policy: an identifying User-Agent, at most one request a second, cached results.
 * The public server is for light use only: point NOMINATIM_URL at your own instance or a paid geocoder for production.
 * A result is accepted only if it is in South Africa and names the expected suburb and city, so a same-named street elsewhere is never used.
 * Precision is reported honestly: house number (address), street, or suburb centre.
 */
export function nominatimGeocoder(o: { baseUrl?: string; userAgent?: string; minIntervalMs?: number; timeoutMs?: number } = {}): Geocoder {
  const base = o.baseUrl ?? process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org/search';
  const ua = o.userAgent ?? process.env.GEOCODER_USER_AGENT ?? process.env.OSM_USER_AGENT ?? 'eix-property-decision-api/1.0';
  const gap = o.minIntervalMs ?? 1100;
  const cache = new Map<string, { at: number; out: GeoOutcome }>();
  let next = 0;
  const gate = async () => { const wait = Math.max(0, next - Date.now()); next = Date.now() + wait + gap; if (wait) await new Promise(r => setTimeout(r, wait)); };

  return async q => {
    const street = q.address?.split(',')[0]?.trim(), bare = street?.replace(/^\d+[A-Za-z]?\s*[,/-]?\s*/, '');
    const place = [q.suburb, q.city].filter(Boolean).join(', ');
    const queries = [...new Set([street && `${street}, ${place}`, bare && bare !== street && `${bare}, ${place}`, q.suburb && `${place}`].filter(Boolean) as string[])].map(s => `${s}, South Africa`);
    if (!queries.length) return { status: 'not_found', attempts: 0 };
    const key = queries.join('|').toLowerCase(), hit = cache.get(key);
    if (hit && Date.now() - hit.at < (hit.out.status === 'ok' ? 30 * 864e5 : 36e5)) return hit.out;

    const acceptable = (r: any) => {
      const lat = Number(r?.lat), lng = Number(r?.lon), a = r?.address ?? {};
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inSA(lat, lng)) return false;
      const hay = norm([r.display_name, a.suburb, a.neighbourhood, a.city_district, a.quarter, a.city, a.town, a.municipality].join(' '));
      return (!q.suburb || hay.includes(norm(q.suburb))) && (!q.city || hay.includes(norm(q.city)));
    };
    let attempts = 0, sawRows = false;
    try {
      for (const text of queries) {
        await gate(); attempts++;
        const url = new URL(base); url.search = new URLSearchParams({ q: text, format: 'jsonv2', addressdetails: '1', limit: '5', countrycodes: 'za' }).toString();
        const res = await fetch(url, { headers: { 'user-agent': ua, 'accept-language': 'en' }, signal: AbortSignal.timeout(o.timeoutMs ?? 8000) });
        if (!res.ok) throw new Error(`geocoder ${res.status}`);
        const rows: any[] = await res.json();
        if (Array.isArray(rows) && rows.length) sawRows = true;
        const r = Array.isArray(rows) ? rows.find(acceptable) : undefined;
        if (r) {
          const a = r.address ?? {};
          const out: GeoOutcome = { status: 'ok', attempts, result: { lat: Number(r.lat), lng: Number(r.lon), precision: a.house_number ? 'address' : a.road ? 'street' : 'suburb', matchedAs: String(r.display_name ?? text).slice(0, 160) } };
          cache.set(key, { at: Date.now(), out }); if (cache.size > 2000) cache.delete(cache.keys().next().value!);
          return out;
        }
      }
    } catch { return { status: 'unavailable', attempts }; }
    const out: GeoOutcome = { status: sawRows ? 'mismatch' : 'not_found', attempts };
    cache.set(key, { at: Date.now(), out });
    return out;
  };
}
