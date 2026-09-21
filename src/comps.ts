export interface CompIn { value: number; floorSqm?: number; erfSqm?: number; beds?: number; type?: string; date?: string; kind?: 'sold' | 'asking' }
export interface Subject { floorSqm?: number; erfSqm?: number; beds?: number; type?: string }
export type EstOk = { strength: 'strong' | 'moderate' | 'weak'; value: number; low: number; high: number; dispersion: number; rawDispersion: number; used: number; excluded: number; nEff: number; outliers: number; basis: 'per_m2' | 'raw'; askingShare: number };
export type Est = EstOk | { strength: 'insufficient'; used: number; excluded: number };

const MONTH = 2.63e9;
const cls = (s?: string) => (!s ? undefined : /apartment|flat|studio/i.test(s) ? 'apt' : /town|cluster|duplex/i.test(s) ? 'town' : /house/i.test(s) ? 'house' : s.toLowerCase());
type Row = { v: number; w: number; perM2: boolean; ask: boolean };
/** Weighted quantile; with equal weights this is the ordinary median or quartile. */
export function wq(rows: { v: number; w: number }[], q: number) {
  const s = [...rows].sort((a, b) => a.v - b.v), target = s.reduce((t, x) => t + x.w, 0) * q;
  let cum = 0;
  for (let i = 0; i < s.length; i++) { cum += s[i].w; if (Math.abs(cum - target) < 1e-9 && i + 1 < s.length) return (s[i].v + s[i + 1].v) / 2; if (cum > target) return s[i].v; }
  return s[s.length - 1].v;
}

/**
 * Similarity- and recency-weighted benchmark from comparable sales or rentals.
 * Comparables of another type get no weight; size, bedrooms and age reduce weight; asking prices count less than sold.
 * Values are scaled to the subject's floor area when both sizes are known. Strength reflects how many are truly similar and how tightly they agree.
 */
export function estimate(items: CompIn[], s: Subject, now = Date.now()): Est {
  const rows: Row[] = items.map(c => {
    let w = 1;
    const ct = cls(c.type), st = cls(s.type);
    if (ct && st && ct !== st) w = 0;
    if (c.floorSqm && s.floorSqm) w *= Math.max(0, 1 - Math.abs(c.floorSqm / s.floorSqm - 1) / 0.4);
    else if (c.erfSqm && s.erfSqm && !s.floorSqm) w *= Math.max(0, 1 - Math.abs(c.erfSqm / s.erfSqm - 1) / 0.6);
    else w *= s.floorSqm ? 0.6 : 0.8;
    if (c.beds !== undefined && s.beds !== undefined) { const d = Math.abs(c.beds - s.beds); w *= d === 0 ? 1 : d === 1 ? 0.5 : 0.1; } else w *= 0.85;
    const m = c.date ? (now - Date.parse(c.date)) / MONTH : undefined;
    w *= m === undefined || Number.isNaN(m) ? 0.7 : m <= 6 ? 1 : m >= 36 ? 0 : 1 - ((m - 6) / 30) * 0.7;
    if (c.kind === 'asking') w *= 0.7;
    const perM2 = !!(c.floorSqm && s.floorSqm);
    return { v: perM2 ? (c.value / c.floorSqm!) * s.floorSqm! : c.value, w, perM2, ask: c.kind === 'asking' };
  });
  let used = rows.filter(r => r.w >= 0.15);
  const excluded = rows.length - used.length;
  if (used.length < 3) return { strength: 'insufficient', used: used.length, excluded };
  if (used.length >= 5) {
    const m = wq(used, .5), mad = wq(used.map(r => ({ v: Math.abs(r.v - m), w: r.w })), .5);
    // Drop only real outliers: beyond 3 robust deviations AND more than 10% from the median (a very tight cluster must not shed its own members)
    const tol = Math.max(3 * 1.4826 * mad, 0.1 * m);
    used = used.filter(r => Math.abs(r.v - m) <= tol);
  }
  const outliers = rows.length - excluded - used.length;
  if (used.length < 3) return { strength: 'insufficient', used: used.length, excluded: excluded + outliers };
  const value = wq(used, .5), low = wq(used, .25), high = wq(used, .75);
  // Weights can make a heterogeneous pool look tight by down-weighting its extremes, so the unweighted spread also counts
  const eq = used.map(r => ({ v: r.v, w: 1 })), rawDispersion = (wq(eq, .75) - wq(eq, .25)) / wq(eq, .5);
  const W = used.reduce((t, r) => t + r.w, 0), W2 = used.reduce((t, r) => t + r.w * r.w, 0), nEff = (W * W) / W2, dispersion = (high - low) / value;
  const share = (f: (r: Row) => boolean) => used.filter(f).reduce((t, r) => t + r.w, 0) / W;
  return {
    strength: nEff < 3 || dispersion > .30 || rawDispersion > .45 ? 'weak' : nEff >= 5 && dispersion <= .15 && rawDispersion <= .25 ? 'strong' : 'moderate',
    value, low, high, dispersion, rawDispersion, used: used.length, excluded, nEff, outliers, basis: share(r => r.perM2) >= .5 ? 'per_m2' : 'raw', askingShare: share(r => r.ask),
  };
}
