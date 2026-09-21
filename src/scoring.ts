import { readFileSync } from 'node:fs';

/** Every tunable in the scorecard. Override any subset with a JSON file via SCORING_CONFIG; the version is returned in every response. */
export const DEFAULT_SCORING = {
  version: '2026.1',
  weights: { pricePosition: 30, priceMunicipal: 12, rentalInvestor: 30, rentalOther: 10, affordabilityInvestor: 15, affordabilityOther: 30, cashFlowInvestor: 20, cashFlowOther: 8, runningCosts: 8, propertyRisks: 12 },
  priceCapMargin: 30,
  withholdBelowConfidence: 30,
  provisionalBelowConfidence: 60,
  negotiateGap: 0.07,
  buy: { minConfidence: 70, minScore: 75, maxRisk: 35, maxBondRatio: 0.3, investorMinNetYield: 0.06, maxAboveMunicipal: 1.15 },
  walk: { minConfidence: 60, strongGap: 0.2, bondRatio: 0.45, maxScore: 35 },
  bands: { strong: 80, good: 65, fair: 50, weak: 35 },
  risk: { base: 10, high: 22, medium: 10, low: 3, rateShock: 10 },
};
export type Scoring = typeof DEFAULT_SCORING;
const merge = (a: any, b: any): any => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, b?.[k] === undefined ? v : v && typeof v === 'object' ? merge(v, b[k]) : b[k]]));
let cache: Scoring | undefined;
export function loadScoring(): Scoring {
  if (cache) return cache;
  const p = process.env.SCORING_CONFIG;
  if (!p) return (cache = DEFAULT_SCORING);
  try {
    const custom = JSON.parse(readFileSync(p, 'utf8'));
    cache = merge(DEFAULT_SCORING, custom) as Scoring;
    if (!custom.version) cache.version = `${DEFAULT_SCORING.version}+custom`;
    return cache;
  } catch (e) { throw new Error(`SCORING_CONFIG could not be read: ${p} (${(e as Error).message})`); }
}
export const resetScoringCache = () => { cache = undefined; };
