import { pmt, type Decision } from './decide.js';
import { estimate } from './comps.js';
import { loadScoring } from './scoring.js';
import type { Listing } from './types.js';

export interface RentalComp { monthlyRent: number; floorSqm?: number; beds?: number; propertyType?: string; date?: string }
export interface RentCtx { basis: 'supplied' | 'rent_per_m2' | 'rent'; count: number; low?: number; high?: number }

export const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));
const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;
/** Piecewise-linear map from a metric to a 0-100 score. */
export const lerp = (x: number, pts: [number, number][]) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
  return pts[pts.length - 1][1];
};
const zar = (n: number) => (n < 0 ? '-R ' : 'R ') + Math.abs(Math.round(n)).toLocaleString('en-ZA');
const pc = (n: number) => `${Math.abs(n * 100).toFixed(1)}%`;

/** Rent from 3+ genuinely similar rentals (weighted by type, size, bedrooms, age). Returns a note instead when the evidence is too thin or too spread out. */
export function estimateRent(L: Listing, rentals: RentalComp[]): (RentCtx & { median: number }) | { note: string } {
  const e = estimate(rentals.filter(r => r.monthlyRent > 0).map(r => ({ value: r.monthlyRent, floorSqm: r.floorSqm, beds: r.beds, type: r.propertyType, date: r.date })), { floorSqm: L.floorSqm, beds: L.beds, type: L.propertyType });
  if (e.strength === 'insufficient') return { note: `Only ${e.used} of ${rentals.length} rental comparables are similar enough (same type, similar size). Add closer matches.` };
  if (e.strength === 'weak') return { note: `The rental comparables are too spread out to estimate a rent (their middle half spans ${Math.round(e.dispersion * 100)}% of the median).` };
  return { median: e.value, low: e.low, high: e.high, count: e.used, basis: e.basis === 'per_m2' ? 'rent_per_m2' : 'rent' };
}

const EVIDENCE_GAPS = new Set(['NO_COMPARABLES', 'FLOOR_AREA_MISSING', 'TITLE_TYPE_UNKNOWN', 'LEVY_NOT_STATED', 'WEAK_RENTAL_EVIDENCE']);

/** Investment Score, Risk Score, Confidence, rental return, cash flow and a verdict: rule-based, explainable, and configurable (see scoring.ts). */
export function buildScorecard(d: Decision, rc?: RentCtx) {
  const S = loadScoring(), W = S.weights, { L, p, bench: b } = d, inv = p.buyer === 'investor', known = (v: unknown) => v !== undefined;
  rc = rc ?? (p.monthlyRent ? { basis: 'supplied', count: 0 } : undefined);

  // Confidence: how much of the evidence a decision needs is actually in hand (max 100). Asking-price comparables count for less.
  const priceBase = b ? (b.strength === 'strong' ? 30 : 20) : d.implied ? 8 : 0;
  const areas = [
    { area: 'Asking price', pts: 10, max: 10 },
    { area: 'Physical facts', pts: 5 * [L.beds, L.baths, L.floorSqm, L.erfSqm].filter(known).length, max: 20 },
    { area: 'Rates', pts: known(L.rates) ? 5 : 0, max: 5 },
    { area: 'Levy and title type', pts: (known(L.levy) || L.titleType === 'freehold' ? 5 : 0) + (L.titleType !== 'unknown' ? 5 : 0), max: 10 },
    { area: 'Price evidence', pts: Math.round(priceBase * (b ? 1 - 0.25 * b.est.askingShare : 1)), max: 30 },
    { area: 'Rental evidence', pts: rc ? (rc.basis === 'supplied' ? 8 : 15) : 0, max: 15 },
    { area: 'Buyer finances', pts: p.grossIncome ? 10 : 0, max: 10 },
  ].map(a => ({ ...a, status: a.pts >= a.max ? 'established' : a.pts > 0 ? 'partial' : 'missing' }));
  const percent = areas.reduce((s, a) => s + a.pts, 0);

  // Investment score: weighted average of the components the evidence supports
  const parts: { key: string; label: string; w: number; score: number; basis: string }[] = [];
  const add = (key: string, label: string, w: number, score: number, basis: string) => parts.push({ key, label, w, score: Math.round(clamp(score)), basis });
  if (b) add('price_position', 'Price against comparable sales', W.pricePosition, lerp(b.gap, [[-.1, 90], [.07, 70], [.25, 30], [.45, 0]]), `asking ${pc(b.gap)} ${b.gap >= 0 ? 'above' : 'below'} ${b.n} comparable sales`);
  else if (d.implied) { const mid = (d.implied.low + d.implied.high) / 2, g = (d.price - mid) / mid; add('price_position', 'Price against municipal value', W.priceMunicipal, lerp(g, [[-.1, 80], [.1, 65], [.3, 35], [.6, 0]]), `asking ${pc(g)} ${g >= 0 ? 'above' : 'below'} the municipal value bracket`); }
  if (d.rent) add('rental_return', 'Rental return', inv ? W.rentalInvestor : W.rentalOther, lerp(d.rent.netYield * 100, [[0, 10], [3, 35], [5, 60], [7, 80], [9, 95], [11, 100]]), `${(d.rent.netYield * 100).toFixed(1)}% net yield`);
  if (d.bondRatio !== undefined) add('affordability', 'Affordability', inv ? W.affordabilityInvestor : W.affordabilityOther, lerp(d.bondRatio * 100, [[20, 100], [25, 90], [30, 70], [33, 50], [40, 20], [50, 0]]), `bond is ${(d.bondRatio * 100).toFixed(0)}% of gross income`);
  else if (d.rent) add('cash_flow', 'Rental cash flow', inv ? W.cashFlowInvestor : W.cashFlowOther, lerp(d.rent.cashflow * 12 / d.price * 100, [[-3, 0], [-1.5, 25], [-.5, 55], [0, 75], [1, 95]]), `${zar(d.rent.cashflow)} a month after all costs`);
  if (known(L.rates) && (known(L.levy) || L.titleType === 'freehold')) { const f = ((L.rates ?? 0) + (L.levy ?? 0)) * 12 / d.price * 100; add('running_costs', 'Running costs', W.runningCosts, lerp(f, [[.4, 95], [.8, 80], [1.5, 55], [2.5, 25], [4, 0]]), `rates and levy are ${f.toFixed(1)}% of price a year`); }
  const scored = d.flags.filter(f => !EVIDENCE_GAPS.has(f.code) && f.code !== 'HIGH_BOND_TO_INCOME' && f.code !== 'ABOVE_MUNICIPAL_VALUE');
  add('property_risks', 'Property and deal risks', W.propertyRisks, 85 - scored.reduce((s, f) => s + (f.level === 'high' ? 20 : f.level === 'medium' ? 8 : 2), 0), `${scored.length} flag${scored.length === 1 ? '' : 's'} raised`);
  const wsum = parts.reduce((s, x) => s + x.w, 0), raw = parts.reduce((s, x) => s + x.w * x.score, 0) / wsum;
  const priceScore = parts.find(x => x.key === 'price_position');
  const cap = b && priceScore ? priceScore.score + S.priceCapMargin : 100;   // a poor price cannot be offset by other strengths
  const value = percent < S.withholdBelowConfidence ? null : Math.round(Math.min(raw, cap));
  // Without a comparables benchmark the price is unproven, so the result stays provisional however much else is known
  const provisional = percent < S.provisionalBelowConfidence || !b;

  // Risk score: higher means riskier; evidence gaps lower confidence instead
  // Points are treated as independent chances, so stacked flags add up with diminishing returns and can never saturate the score
  let keep = 1 - S.risk.base / 100; const drivers: string[] = [];
  for (const f of d.flags) if (!EVIDENCE_GAPS.has(f.code)) { const pts = f.level === 'high' ? S.risk.high : f.level === 'medium' ? S.risk.medium : S.risk.low; keep *= 1 - pts / 100; if (pts >= S.risk.medium) drivers.push(f.text.split('. ')[0].replace(/\.$/, '')); }
  if (p.grossIncome && pmt(d.loan, p.rate + 2, p.termYears) / p.grossIncome > .4) { keep *= 1 - S.risk.rateShock / 100; drivers.push('A 2-point rate rise would push the bond above 40% of income'); }
  const risk = Math.round((1 - keep) * 100);

  // Decision: BUY and WALK AWAY need enough evidence; below that the label stays cautious
  const walk = percent >= S.walk.minConfidence && ((b?.strength === 'strong' && b.gap > S.walk.strongGap) || (d.bondRatio !== undefined && d.bondRatio > S.walk.bondRatio) || (value !== null && value < S.walk.maxScore));
  const buy = !!b && value !== null && percent >= S.buy.minConfidence && value >= S.buy.minScore && risk <= S.buy.maxRisk && d.bondRatio !== undefined && d.bondRatio <= S.buy.maxBondRatio && !(b && b.gap > S.negotiateGap) && !(inv && d.rent && d.rent.netYield < S.buy.investorMinNetYield) && !(d.implied && d.price > d.implied.high * S.buy.maxAboveMunicipal);
  const label = walk ? 'WALK AWAY' : b && b.gap > S.negotiateGap ? 'NEGOTIATE' : buy ? 'BUY' : 'PROCEED WITH CAUTION';
  const reasons = [
    b ? `Asking is ${pc(b.gap)} ${b.gap >= 0 ? 'above' : 'below'} the benchmark from ${b.n} comparable sales${Math.abs(b.gap) <= S.negotiateGap ? ', which is in line' : ''}.` : d.implied ? `Asking is ${zar(d.price)} against a municipal value bracket of ${zar(d.implied.low)} to ${zar(d.implied.high)}; no usable comparable sales were supplied.` : 'No usable comparable sales were supplied, so price fairness is unproven.',
    ...(d.bondRatio !== undefined ? [`The bond is ${(d.bondRatio * 100).toFixed(0)}% of gross income.`] : []),
    ...(d.rent ? [inv ? `Rent of ${zar(p.monthlyRent!)} leaves a monthly cash flow of ${zar(d.rent.cashflow)} after the bond, rates, levy, upkeep and vacancy.` : `Similar homes rent for about ${zar(p.monthlyRent!)} a month, against ${zar(d.ownCost)} to own before principal.`] : []),
    ...(percent < S.provisionalBelowConfidence ? [`Confidence is ${percent}%, so this is provisional until the missing evidence is added.`] : []),
    ...drivers.slice(0, 1).map(x => x + '.'),
  ];
  const missing = areas.filter(a => a.pts < a.max && a.area !== 'Asking price').sort((x, y) => y.max - y.pts - (x.max - x.pts)).slice(0, 2).map(a => a.area.toLowerCase());
  const nextStep = label === 'WALK AWAY' ? 'Do not offer at this price. Revisit if the price falls or your income or deposit rises.'
    : label === 'NEGOTIATE' && b ? `Open near the benchmark (${zar(b.low)} to ${zar(b.value)}) and make the offer subject to an inspection.`
    : label === 'BUY' ? 'Proceed to an offer that is subject to bond approval, an inspection and the compliance certificates.'
    : missing.length ? `Add the missing evidence first: ${missing.join(' and ')}.` : 'Verify the flagged items, then decide.';
  const B = S.bands;
  return {
    scoringVersion: S.version,
    investmentScore: { value, band: value === null ? 'Insufficient evidence' : value >= B.strong ? 'Strong' : value >= B.good ? 'Good' : value >= B.fair ? 'Fair' : value >= B.weak ? 'Weak' : 'Poor', provisional, components: parts.map(x => ({ key: x.key, label: x.label, weightPercent: Math.round(x.w / wsum * 100), score: x.score, basis: x.basis })) },
    riskScore: { value: percent < S.withholdBelowConfidence ? null : risk, band: percent < S.withholdBelowConfidence ? 'Insufficient evidence' : risk < 25 ? 'Low' : risk < 45 ? 'Moderate' : risk < 65 ? 'Elevated' : 'High', provisional, drivers },
    confidence: { percent, band: percent < 40 ? 'Low' : percent < 70 ? 'Moderate' : 'High', areas },
    decision: { label, reasons, nextStep },
    rental: d.rent && rc && p.monthlyRent ? { estimateMonthly: r2(p.monthlyRent), lowMonthly: rc.low ? r2(rc.low) : null, highMonthly: rc.high ? r2(rc.high) : null, basis: rc.basis, comparablesUsed: rc.count, grossYieldPercent: r1(d.rent.grossYield * 100), netYieldPercent: r1(d.rent.netYield * 100), monthlyCashFlow: r2(d.rent.cashflow), coversMonthlyCosts: d.rent.cashflow >= 0 } : null,
  };
}
