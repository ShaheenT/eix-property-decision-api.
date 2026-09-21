import type { Decision } from './decide.js';

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;
const zar = (n: number) => 'R ' + Math.round(n).toLocaleString('en-ZA');

/** Tests a marketing income claim against the numbers. It never feeds the score: only evidence the buyer supplies does that. */
export function incomeTest(d: Decision) {
  const c = d.L.claims, stated = c?.statedMonthlyIncome, units = c?.units;
  if (!stated && !(units && units >= 2)) return null;
  const fixed = (d.L.rates ?? 0) + (d.L.levy ?? 0), need = d.bond + fixed + d.reserve;
  const notes = ['The figure is the seller\'s or agent\'s claim, not evidence.', 'Yield in a listing is normally gross. It ignores rates, insurance, upkeep, platform fees, cleaning, utilities, tax and vacancy.'];
  if (d.L.claims?.shortTermUnits) notes.push('Short-term income is seasonal and depends on platform ranking and reviews, which do not transfer with the sale.');
  const verdict = !stated ? 'No income was stated. The figures show what the units would have to earn.'
    : stated < d.bond ? `The stated income of ${zar(stated)} does not cover the bond of ${zar(d.bond)}, before rates, insurance, upkeep or any operating cost.`
    : stated < need ? `The stated income covers the bond but not the full cost of ownership (${zar(need)} a month).`
    : 'On paper the stated income covers the cost of ownership, but it is unverified.';
  return {
    basis: stated ? 'listing_claim' : 'units_only',
    statedMonthlyIncome: stated ?? null, statedYieldPercent: c?.statedYieldPercent ?? null,
    impliedGrossYieldPercent: stated ? r1(stated * 12 / d.price * 100) : null,
    netYieldOnClaimPercent: stated ? r1((stated * 12 - fixed * 12 - d.price * 0.01) / d.price * 100) : null,
    bond: r2(d.bond), coversBond: stated ? stated >= d.bond : null, monthlyShortfallVsBond: stated ? r2(Math.max(0, d.bond - stated)) : null,
    breakEvenMonthlyIncome: r2(need), incomeUpliftNeededPercent: stated ? r1(Math.max(0, (need / stated - 1) * 100)) : null,
    units: units ?? null, breakEvenPerUnit: units ? r2(need / units) : null,
    nightlyRateIfAllShortTerm: units ? [50, 65, 80].map(o => ({ occupancyPercent: o, nightlyRatePerUnit: r2(need / units / (30.4 * o / 100)) })) : [],
    verdict, notes,
  };
}
