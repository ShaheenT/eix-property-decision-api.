import { clamp, lerp } from './scorecard.js';
import type { Flag, Decision } from './decide.js';
import { provinceOf } from './places.js';

export type Cat = 'grocery' | 'pharmacy' | 'eatery' | 'nightlife' | 'culture' | 'park' | 'school' | 'health' | 'transit' | 'station' | 'safety';
export interface Poi { cat: Cat; d: number; label?: string }
export type Provider = (lat: number, lng: number) => Promise<Poi[]>;
export interface Metrics { crimePer100k?: number; benchmarkCrimePer100k?: number; priceGrowth5yPercent?: number; medianDaysOnMarket?: number }

export const DIMS: [string, string][] = [['walkability', 'Walkability'], ['transport', 'Public transport'], ['education', 'Schools nearby'], ['lifestyle', 'Lifestyle and dining'], ['greenSpace', 'Green space'], ['health', 'Healthcare access'], ['safety', 'Safety'], ['marketMomentum', 'Price momentum'], ['demand', 'Buyer demand']];
export const DIM_KEYS = DIMS.map(d => d[0]);
export const PRESETS: Record<string, Record<string, number>> = {
  balanced: Object.fromEntries(DIM_KEYS.map(k => [k, 3])),
  family: { education: 5, safety: 5, greenSpace: 4, health: 3, walkability: 2, transport: 2, marketMomentum: 2, demand: 1, lifestyle: 1 },
  young_professional: { walkability: 5, transport: 5, lifestyle: 5, safety: 4, greenSpace: 2, marketMomentum: 2, demand: 2, health: 1, education: 0 },
  retiree: { health: 5, safety: 5, walkability: 4, greenSpace: 3, transport: 3, lifestyle: 2, marketMomentum: 1, demand: 1, education: 0 },
  investor: { marketMomentum: 5, demand: 5, transport: 3, walkability: 3, lifestyle: 3, safety: 3, education: 2, greenSpace: 1, health: 1 },
};
export const PRESET_NAMES = Object.keys(PRESETS);

export interface Dim { key: string; label: string; score: number | null; source: 'openstreetmap' | 'supplied' | 'not_established'; evidence: string }
export interface Nb {
  status: 'assessed' | 'partial' | 'not_requested';
  location: { lat: number; lng: number; source: 'listing' | 'supplied' | 'geocoded'; precision: 'supplied' | 'address' | 'street' | 'suburb'; matchedAs: string | null } | null;
  archetype: { label: string; summary: string } | null;
  dimensions: Dim[];
  fit: { priorities: string; percent: number | null; coverage: number; provisional: boolean; strengths: string[]; tradeoffs: string[] } | null;
  confidencePercent: number;
  attribution: string[];
  geocoding: { status: 'not_needed' | 'ok' | 'not_found' | 'mismatch' | 'unavailable' | 'disabled'; precision: 'address' | 'street' | 'suburb' | null; matchedAs: string | null; attempts: number };
  /** Whether the map lookup ran: an empty tile means "unchecked" unless this is ok. */
  mapStatus: 'not_requested' | 'disabled' | 'no_coordinates' | 'unavailable' | 'ok';
  /** Police and fire stations near the property (used only for the safety tile, never scored). */
  infra: { label: string; distanceM: number }[];
}
export const NOT_REQUESTED: Nb = { status: 'not_requested', location: null, archetype: null, dimensions: [], fit: null, confidencePercent: 0, attribution: [], geocoding: { status: 'not_needed', precision: null, matchedAs: null, attempts: 0 }, mapStatus: 'not_requested', infra: [] };
export interface NbInput { location?: { lat: number; lng: number }; locationSource?: 'listing' | 'supplied' | 'geocoded'; precision?: 'supplied' | 'address' | 'street' | 'suburb'; matchedAs?: string; priorities?: string | Record<string, number>; metrics?: Metrics; useOsm?: boolean }

/** Neighbourhood DNA: what is around the property (OpenStreetMap), what the market says (supplied), and how well both fit what this buyer wants. Thresholds are tunable heuristics. */
export async function assessNeighbourhood(i: NbInput, provider: Provider): Promise<Nb> {
  const m = i.metrics ?? {}, S: Record<string, Dim> = {};
  const set = (key: string, score: number | null, source: Dim['source'], evidence: string) => { S[key] = { key, label: DIMS.find(d => d[0] === key)![1], score: score === null ? null : Math.round(clamp(score)), source, evidence }; };
  let pois: Poi[] | undefined, note = 'Not requested', mapStatus: Nb['mapStatus'] = 'disabled';
  if (i.useOsm !== false) {
    if (!i.location) { note = 'No coordinates: the listing has none and none were supplied'; mapStatus = 'no_coordinates'; }
    else try {
      pois = await provider(i.location.lat, i.location.lng); mapStatus = 'ok';
      // An empty answer usually means a map data gap, not an empty street: report it, never score it as zero
      if (!pois.length) { pois = undefined; note = 'Nothing was mapped within 1.5 km, which usually means a map data gap; no score is inferred'; }
    } catch { note = 'OpenStreetMap data was unavailable'; mapStatus = 'unavailable'; }
  }
  if (pois) {
    const n = (c: Cat[], r: number) => pois!.filter(p => c.includes(p.cat) && p.d <= r).length, sp = (pois.length < 8 ? ' (map data is sparse here; treat as a minimum)' : '') + (i.precision === 'suburb' ? ' (anchored on the suburb centre, so distances are approximate)' : i.precision === 'street' ? ' (anchored on the street, so distances are approximate)' : '');
    const daily: Cat[] = ['grocery', 'pharmacy', 'eatery', 'park', 'school', 'health'], present = daily.filter(c => n([c], 800)).length, total = n(daily, 800);
    set('walkability', (present / 6) * 70 + Math.min(30, total * 1.5), 'openstreetmap', `${present} of 6 daily-needs types and ${total} places within 800 m${sp}`);
    set('transport', n(['transit'], 500) * 12 + n(['transit'], 1000) * 4 + (n(['station'], 1500) ? 20 : 0), 'openstreetmap', `${n(['transit'], 500)} stops within 500 m, ${n(['transit'], 1000)} within 1 km, ${n(['station'], 1500)} rail stations within 1.5 km${sp}`);
    set('education', lerp(n(['school'], 1500), [[0, 0], [1, 35], [3, 65], [5, 90], [8, 100]]), 'openstreetmap', `${n(['school'], 1500)} schools within 1.5 km (access only, not school quality)${sp}`);
    set('lifestyle', lerp(n(['eatery', 'nightlife', 'culture'], 800), [[0, 0], [3, 30], [8, 55], [15, 80], [30, 100]]), 'openstreetmap', `${n(['eatery', 'nightlife', 'culture'], 800)} dining, nightlife and cultural venues within 800 m${sp}`);
    set('greenSpace', lerp(n(['park'], 800), [[0, 0], [1, 45], [2, 70], [4, 90], [6, 100]]), 'openstreetmap', `${n(['park'], 800)} parks or playgrounds within 800 m${sp}`);
    set('health', lerp(n(['health'], 1500), [[0, 0], [1, 50], [3, 80], [5, 100]]), 'openstreetmap', `${n(['health'], 1500)} clinics, doctors or hospitals within 1.5 km${sp}`);
  } else for (const k of ['walkability', 'transport', 'education', 'lifestyle', 'greenSpace', 'health']) set(k, null, 'not_established', note);
  const ratio = m.crimePer100k !== undefined && m.benchmarkCrimePer100k ? m.crimePer100k / m.benchmarkCrimePer100k : undefined;
  set('safety', ratio === undefined ? null : lerp(ratio, [[.5, 95], [1, 60], [1.5, 30], [2.5, 0]]), ratio === undefined ? 'not_established' : 'supplied', ratio === undefined ? 'Supply crimePer100k and benchmarkCrimePer100k' : `${m.crimePer100k} incidents per 100k against a benchmark of ${m.benchmarkCrimePer100k} (${ratio.toFixed(2)}x)`);
  set('marketMomentum', m.priceGrowth5yPercent === undefined ? null : lerp(m.priceGrowth5yPercent, [[-10, 0], [0, 15], [28, 50], [50, 70], [80, 90], [120, 100]]), m.priceGrowth5yPercent === undefined ? 'not_established' : 'supplied', m.priceGrowth5yPercent === undefined ? 'Supply priceGrowth5yPercent' : `${m.priceGrowth5yPercent}% over 5 years (about 28% is inflation at 5% a year)`);
  set('demand', m.medianDaysOnMarket === undefined ? null : lerp(m.medianDaysOnMarket, [[30, 95], [60, 80], [90, 60], [150, 30], [240, 0]]), m.medianDaysOnMarket === undefined ? 'not_established' : 'supplied', m.medianDaysOnMarket === undefined ? 'Supply medianDaysOnMarket' : `homes take a median of ${m.medianDaysOnMarket} days to sell`);
  const dimensions = DIM_KEYS.map(k => S[k]);

  const W = typeof i.priorities === 'object' ? i.priorities : PRESETS[i.priorities ?? 'balanced'];
  const wOf = (k: string) => W[k] ?? 0, wsum = DIM_KEYS.reduce((s, k) => s + wOf(k), 0), scored = dimensions.filter(d => d.score !== null);
  const wdata = scored.reduce((s, d) => s + wOf(d.key), 0), coverage = wsum ? Math.round((wdata / wsum) * 100) : 0;
  const percent = wdata ? Math.round(scored.reduce((s, d) => s + wOf(d.key) * d.score!, 0) / wdata) : null;
  const strengths = dimensions.filter(d => wOf(d.key) >= 4 && (d.score ?? 0) >= 70).map(d => `${d.label} is strong (${d.score}/100)`);
  const tradeoffs = dimensions.filter(d => wOf(d.key) >= 4 && (d.score === null || d.score < 45)).map(d => (d.score === null ? `${d.label} could not be established` : `${d.label} is weak (${d.score}/100)`));

  const s = (k: string) => S[k].score ?? -1;
  const archetype = !pois ? null
    : s('walkability') >= 65 && s('lifestyle') >= 55 ? { label: 'Walkable urban village', summary: 'Daily needs, dining and lifestyle are within walking distance.' }
    : s('transport') >= 70 && s('walkability') >= 45 ? { label: 'Transit-connected neighbourhood', summary: 'Good public transport access, so less reliance on a car.' }
    : s('education') >= 60 && s('greenSpace') >= 50 ? { label: 'Family-friendly suburb', summary: 'Schools and green space are close by.' }
    : s('walkability') < 35 && s('transport') < 40 ? { label: 'Car-dependent suburb', summary: 'Few amenities or transit stops nearby; expect to drive for daily needs.' }
    : { label: 'Mixed residential area', summary: 'A balance of amenities without a strong defining character.' };
  const sparse = pois && pois.length < 8;
  return {
    status: coverage >= 60 ? 'assessed' : 'partial',
    location: i.location ? { ...i.location, source: i.locationSource ?? 'supplied', precision: i.precision ?? 'supplied', matchedAs: i.matchedAs ?? null } : null,
    archetype, dimensions,
    fit: { priorities: typeof i.priorities === 'string' ? i.priorities : i.priorities ? 'custom' : 'balanced', percent, coverage, provisional: coverage < 60, strengths, tradeoffs },
    confidencePercent: Math.round(coverage * (sparse ? 0.7 : 1) * (i.precision === 'suburb' ? 0.6 : i.precision === 'street' ? 0.85 : 1)),
    attribution: [...(pois ? ['© OpenStreetMap contributors (ODbL)'] : []), ...(i.locationSource === 'geocoded' ? ['Geocoding: © OpenStreetMap contributors (Nominatim)'] : [])],
    geocoding: { status: 'not_needed', precision: null, matchedAs: null, attempts: 0 },
    mapStatus,
    infra: (pois ?? []).filter(p => p.cat === 'safety').map(p => ({ label: p.label ?? 'Police or fire station', distanceM: p.d })),
  };
}

/** Area findings that belong in the risk list and risk score. */
export function areaFlags(nb: Nb, m: Metrics = {}): Flag[] {
  const out: Flag[] = [], safety = nb.dimensions.find(d => d.key === 'safety');
  if (safety?.score != null && safety.score < 40) out.push({ code: 'AREA_SAFETY_CONCERN', level: 'medium', text: `Crime in this area is above the benchmark you supplied (safety ${safety.score}/100). Ask about security, visit at night and check local crime statistics.` });
  if (m.priceGrowth5yPercent !== undefined && m.priceGrowth5yPercent < 0) out.push({ code: 'AREA_PRICES_FALLING', level: 'medium', text: `Prices in this area fell ${Math.abs(m.priceGrowth5yPercent)}% over five years. Check whether that trend is continuing before you buy.` });
  return out;
}

export interface Area { key: string; label: string; status: 'evidence_found' | 'no_evidence'; reason: 'evidence' | 'none_found' | 'not_retrieved' | 'not_requested'; summary: string; items: { name: string; distanceM: number | null; source: 'listing' | 'openstreetmap' | 'supplied' }[]; source: 'listing' | 'openstreetmap' | 'supplied' | 'none'; score: number | null }
const PRINCIPLE = 'Location intelligence is shown only where the report contains supporting evidence. No neighbourhood score is manufactured from missing data.';

/**
 * The six Neighbourhood DNA tiles, evidence first. Items are what the listing or map actually shows (nearest few, not exhaustive);
 * a score appears only where a scored dimension exists. Where nothing was found the tile says so.
 */
export function neighbourhoodAreas(nb: Nb, d: Decision): Area[] {
  const pois = d.L.pois ?? [];
  const item = (p: { name: string; distanceKm: number }) => ({ name: p.name, distanceM: Math.round(p.distanceKm * 1000), source: 'listing' as const });
  const of = (re: RegExp) => pois.filter(p => re.test(p.category));
  const dimOf = (...keys: string[]) => nb.dimensions.filter(x => keys.includes(x.key) && x.score !== null);
  const mean = (a: Dim[]) => (a.length ? Math.round(a.reduce((s, x) => s + x.score!, 0) / a.length) : null);
  const list = (items: Area['items']) => `${items.map(i => `${i.name}${i.distanceM !== null ? ` (${i.distanceM} m)` : ''}`).join('; ')} (from ${items[0].source === 'listing' ? 'the listing' : 'OpenStreetMap'}).`;
  const missing = (mapBased: boolean, safety: boolean): { text: string; reason: Area['reason'] } => {
    const tail = safety ? ' No safety score is inferred.' : '', own = d.L.url !== 'supplied' && !pois.length ? " The listing's own nearby places were not captured; see listing.capture." : '';
    if (!mapBased) return nb.mapStatus === 'not_requested' ? { text: 'Not checked: the neighbourhood layer was not requested.', reason: 'not_requested' } : { text: 'Market evidence not retrieved.', reason: 'not_retrieved' };
    switch (nb.mapStatus) {
      case 'ok': return { text: 'None mapped within 1.5 km in OpenStreetMap, whose coverage varies.' + tail + own, reason: 'none_found' };
      case 'unavailable': return { text: 'Location data could not be retrieved, so this is unchecked, not empty.' + tail + own, reason: 'not_retrieved' };
      case 'no_coordinates': return { text: 'No coordinates for this listing, so the area was not checked.' + tail + own, reason: 'not_retrieved' };
      case 'disabled': return { text: 'The map lookup was switched off.' + tail + own, reason: 'not_requested' };
      default: return { text: 'Not checked: the neighbourhood layer was not requested.' + tail + own, reason: 'not_requested' };
    }
  };
  const area = (key: string, label: string, items: Area['items'], dims: Dim[], mapBased = true, safety = false, extra = ''): Area => {
    const parts = [...(items.length ? [list(items)] : []), ...dims.map(x => `${x.evidence}.`)], none = missing(mapBased, safety);
    return { key, label, status: parts.length ? 'evidence_found' : 'no_evidence', reason: parts.length ? 'evidence' : none.reason, summary: (parts.length ? parts.join(' ') : none.text) + extra, items, source: dims.some(x => x.source === 'openstreetmap') ? 'openstreetmap' : dims.length ? 'supplied' : items.length ? items[0].source : 'none', score: mean(dims) };
  };
  const days = d.L.listedDate ? Math.max(0, Math.floor((Date.now() - Date.parse(d.L.listedDate)) / 864e5)) : undefined;
  const thisListing = days === undefined ? '' : ` This listing: ${days} days on the market${d.L.status === 'under_offer' ? ' and now under offer' : ''}.`;
  return [
    area('transport', 'Transport', of(/transport/i).filter(p => !/recycl|\bbins?\b|waste|skip|depot/i.test(p.name)).map(item), dimOf('transport')),
    area('schools_healthcare', 'Schools / healthcare', [...of(/education/i), ...of(/health/i)].map(item), dimOf('education', 'health')),
    area('lifestyle_retail', 'Lifestyle / retail', of(/shopping|food|entertainment/i).map(item), dimOf('lifestyle')),
    area('safety', 'Safety indicators', nb.infra.map(i => ({ name: i.label, distanceM: i.distanceM, source: 'openstreetmap' as const })), dimOf('safety'), true, true),
    area('parks_recreation', 'Parks / recreation', [...of(/recreation/i), ...pois.filter(p => !/recreation/i.test(p.category) && /\b(park|garden|reserve|gym|sports?)\b/i.test(p.name))].map(item), dimOf('greenSpace')),
    area('market_momentum', 'Market momentum', [], dimOf('marketMomentum', 'demand'), false, false, thisListing),
  ];
}

/** The public neighbourhood block: place, principle, the six evidence tiles, plus the opt-in scored layer. */
export function publicNeighbourhood(nb: Nb, d: Decision) {
  const { infra: _infra, ...rest } = nb;
  return { ...rest, principle: PRINCIPLE, place: { suburb: d.L.suburb ?? null, city: d.L.city ?? null, province: d.L.province ?? provinceOf(d.L.city) ?? null }, areas: neighbourhoodAreas(nb, d) };
}
