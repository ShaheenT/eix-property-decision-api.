import { pmt, isEstate, transferDuty, type Decision } from './decide.js';
import { incomeTest } from './income.js';
import { buildScorecard, type RentCtx } from './scorecard.js';
import { NOT_REQUESTED, type Nb } from './neighbourhood.js';
import { buildDocumentPack } from './documents.js';
import type { MarketMeta } from './providers.js';

export const SCHEMA_VERSION = '1.0';
export const ENGINE_VERSION = '1.0.0';
/** Date of the SARB decision behind the default prime rate. Update with DEFAULT_RATE. */
export const RATE_AS_OF = '2026-07-23';
export const DISCLAIMER = 'Decision support only. Not a valuation, or financial, tax or legal advice. Figures rely on the stated assumptions and on the facts supplied; verify independently before any transaction.';
const CONDITIONS = [
  'Bond approval within a fixed number of days',
  'A satisfactory building inspection (roof, damp, wiring, plumbing, timber pests)',
  'Valid electrical, plumbing and beetle certificates from the seller, plus electric fence and gas certificates where applicable',
  'Approved building plans for all structures',
  'A written list of what stays (fittings, appliances, solar) and the occupation date',
];
const CODE: Record<string, string> = { 'Gather evidence': 'GATHER_EVIDENCE', 'Negotiate': 'NEGOTIATE', 'Priced in line': 'PRICED_IN_LINE', 'Priced below benchmark': 'PRICED_BELOW_BENCHMARK', 'Affordability stretch': 'AFFORDABILITY_STRETCH' };
const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Stable public contract (v1). Every key is always present; unknown values are null. */
export function toPublic(d: Decision, id: string, rc?: RentCtx, nb: Nb = NOT_REQUESTED, md: MarketMeta = { source: 'none', status: 'ok', salesReceived: 0, rentalsReceived: 0 }) {
  const { L, p, bench: b } = d;
  const scorecard = buildScorecard(d, rc);
  // Unknown costs are reported as null and listed, never as R0
  const levyKnown = L.levy !== undefined || (L.titleType === 'freehold' && !isEstate(L));
  const monthlyExcludes = [...(L.rates === undefined ? ['rates'] : []), ...(levyKnown ? [] : ['levy'])];
  if (nb.fit?.percent != null) scorecard.decision.reasons.push(`Neighbourhood fit is ${nb.fit.percent}% for ${nb.fit.priorities} priorities${nb.fit.provisional ? ' (provisional: some priorities have no data)' : ''}.`);
  const source = (k: string) => (({ jsonld: 'listing', text: 'listing', llm: 'listing_ai_extracted', user: 'supplied' }) as Record<string, string>)[L.src[k]] ?? 'not_stated';
  const facts: [string, number | undefined, string][] = [['asking_price', d.price, 'price'], ['bedrooms', L.beds, 'beds'], ['bathrooms', L.baths, 'baths'], ['parking', L.parking, 'parking'], ['floor_area_m2', L.floorSqm, 'floorSqm'], ['erf_m2', L.erfSqm, 'erfSqm'], ['rates_monthly', L.rates, 'rates'], ['levy_monthly', L.levy, 'levy']];
  return {
    id, schemaVersion: SCHEMA_VERSION, engineVersion: ENGINE_VERSION, generatedAt: new Date().toISOString(),
    property: { address: L.streetAddress ?? null, title: L.title ?? null, suburb: L.suburb ?? null, city: L.city ?? null, propertyType: L.propertyType ?? null, titleType: L.titleType, askingPrice: d.price },
    verdict: { code: CODE[d.status], status: d.status, summary: d.summary, readiness: d.readiness },
    scorecard,
    marketData: md,
    displayGuidance: displayGuidance(scorecard, b, nb, d),
    neighbourhood: nb,
    documents: buildDocumentPack(d),
    listing: captureListing(d),
    incomeTest: incomeTest(d),
    assumptions: { vacancyAllowancePercent: 5, depositPercent: p.depositPct, interestRate: p.rate, interestRateAsOf: RATE_AS_OF, termYears: p.termYears, legalAndBondFeesPercent: 3, upkeepReservePercentPerYear: 1, bondToIncomeRule: 0.3, sellingCostsPercent: 6, transferDuty: p.vatSale ? 'excluded_vat_sale' : 'sars_2026_27' },
    costs: {
      monthly: { bond: r2(d.bond), rates: L.rates ?? null, levy: L.levy ?? (levyKnown ? 0 : null), upkeepReserve: r2(d.reserve), total: r2(d.monthly) },
      monthlyExcludes,
      upfront: { deposit: r2(d.deposit), transferDuty: d.duty, legalAndBondFees: r2(d.fees), total: r2(d.upfront) },
      incomeRequired: { grossMonthly: r2(d.incomeNeeded), grossMonthlyIfRatesRise2Points: r2(pmt(d.loan, p.rate + 2, p.termYears) / 0.3) },
      bondToIncomePercent: d.bondRatio === undefined ? null : r1(d.bondRatio * 100),
    },
    stressTest: { interestRates: [-1, 0, 1, 2].map(x => r2(p.rate + x)), rows: d.grid.map(g => ({ depositPercent: g.dep, monthlyBond: g.cells.map(r2) })) },
    priceEvidence: {
      comparables: b ? { count: b.n, basis: b.basis.includes('R/m²') ? 'price_per_m2_floor' : 'sale_price', benchmarkValue: r2(b.value), gapPercent: r1(b.gap * 100), position: b.position === 'in line' ? 'in_line' : b.position, evidenceStrength: b.strength, effectiveSampleSize: r1(b.est.nEff), dispersionPercent: r1(b.est.dispersion * 100), rawDispersionPercent: r1(b.est.rawDispersion * 100), interquartileRange: { low: r2(b.est.low), high: r2(b.est.high) }, excluded: b.est.excluded, outliersDropped: b.est.outliers, askingPriceSharePercent: r1(b.est.askingShare * 100), discussionRange: b.position === 'above' ? { low: r2(b.low), high: r2(b.value) } : null } : null,
      municipalValue: d.implied ? { low: Math.round(d.implied.low), high: Math.round(d.implied.high), basis: 'cape_town_rates_bill' } : null,
      pricePerM2Floor: d.perFloor ? r2(d.perFloor) : null, pricePerM2Erf: d.perErf ? r2(d.perErf) : null, floorToErfRatioPercent: d.coverage ? r1(d.coverage * 100) : null,
    },
    ownership: {
      costBeforePrincipalMonthly: r2(d.ownCost), principalRepaidFirstMonth: r2(d.principal1),
      breakEven: { requiredPriceRisePercent: r1(d.uplift * 100), yearsByAnnualGrowth: d.breakEven.map(x => ({ annualGrowthPercent: x.g, years: r1(x.years) })) },
      rental: d.rent && p.monthlyRent ? { expectedMonthlyRent: p.monthlyRent, grossYieldPercent: r1(d.rent.grossYield * 100), netYieldPercent: r1(d.rent.netYield * 100), monthlyCashFlow: r2(d.rent.cashflow) } : null,
    },
    risks: d.flags.map(f => ({ code: f.code, severity: f.level === 'info' ? 'low' : f.level, message: f.text })),
    offerPlan: { beforeOffering: d.plan, suggestedConditions: CONDITIONS },
    questionsForAgent: d.questions,
    evidence: facts.map(([field, value, key]) => ({ field, value: value ?? null, source: value === undefined ? 'not_stated' : source(key) })),
    disclaimer: DISCLAIMER,
  };
}
export type DecisionV1 = ReturnType<typeof toPublic>;

type Show = 'show' | 'show_as_provisional' | 'hide';
/** What the report is allowed to show. Front ends should obey this so a figure never appears without the evidence behind it. */
function displayGuidance(sc: ReturnType<typeof buildScorecard>, b: Decision['bench'], nb: Nb, d: Decision) {
  const conf = sc.confidence.percent, prov = sc.investmentScore.provisional, rental = sc.rental;
  const notices: string[] = [];
  if (prov) notices.push(`Provisional: this result rests on ${conf}% of the evidence a full decision needs${b ? '' : ', and the price is not yet checked against comparable sales'}.`);
  if (!b) notices.push('No price verdict is shown because there is not enough comparable evidence.');
  if (d.L.claims?.statedMonthlyIncome) notices.push('The income figure comes from the listing agent and is unverified.');
  if (b && b.est.rawDispersion > 0.35) notices.push('The comparables vary widely in price, so treat the benchmark as indicative.');
  if (b && b.est.askingShare > 0.5) notices.push('The price comparison mostly uses asking prices, which are usually higher than sold prices.');
  if (rental?.basis === 'supplied') notices.push('Rent, yield and cash flow are based on a rent you supplied.');
  if (rental && rental.basis !== 'supplied') notices.push(`Rent is an estimate from ${rental.comparablesUsed} similar rentals and is not a valuation.`);
  return {
    investmentScore: (sc.investmentScore.value === null ? 'hide' : sc.investmentScore.provisional ? 'show_as_provisional' : 'show') as Show,
    decisionLabel: (prov ? 'show_as_provisional' : 'show') as Show,
    priceVerdict: (b ? 'show' : 'hide') as Show,
    rentEstimate: (rental ? 'show' : 'hide') as Show,
    yieldAndCashFlow: (rental ? 'show' : 'hide') as Show,
    neighbourhoodFit: (nb.fit?.percent == null ? 'hide' : nb.fit.provisional ? 'show_as_provisional' : 'show') as Show,
    requiredNotices: notices,
  };
}

const solveRate = (price: number, monthly: number, years: number) => { let lo = 0.5, hi = 30; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (pmt(price, m, years) < monthly) lo = m; else hi = m; } return (lo + hi) / 2; };
/** Everything captured from the live listing page, structured. Marketing copy is analysed, not reproduced. Null for structured input. */
function captureListing(d: Decision) {
  const { L, p } = d;
  if (L.url === 'supplied') return null;
  const pc = L.portalCalc;
  return {
    sourceUrl: L.url, listingNumber: L.listingNumber ?? null, status: L.status ?? 'listed', listedDate: L.listedDate ?? null,
    daysOnMarket: L.listedDate ? Math.max(0, Math.floor((Date.now() - Date.parse(L.listedDate)) / 864e5)) : null,
    streetAddress: L.streetAddress ?? null, agency: L.agency ?? null, agentName: L.agentName ?? null,
    receptionRooms: L.receptionRooms ?? null, parking: L.parking ?? null, imageUrl: L.image ?? null, features: L.features,
    pointsOfInterest: L.pois ?? [],
    recentSales: { addresses: (L.recentSales ?? []).map(r => ({ address: r.address, url: r.url ?? null })), pricesAvailable: false, note: 'Sold prices are shown on the portal as protected images, so they are not captured. Licensed deeds data (Property24 property reports, Lightstone, Windeed) is the source for achieved prices.' },
    portalCalculator: pc ? {
      monthlyRepayment: pc.monthly ?? null, onceOffCosts: pc.onceOff ?? null, minGrossMonthlyIncome: pc.minIncome ?? null,
      impliedInterestRatePercent: pc.monthly ? r2(solveRate(d.price, pc.monthly, p.termYears)) : null,
      impliedIncomeRulePercent: pc.monthly && pc.minIncome ? r1(pc.monthly / pc.minIncome * 100) : null,
      impliedFeesAndBondCosts: pc.onceOff ? pc.onceOff - transferDuty(d.price) : null, eixFeesEstimate: r2(d.fees),
      note: 'Implied from the portal\'s own figures, assuming no deposit and the same term. Your deposit lowers the bond.',
    } : null,
    signals: L.signals ?? [],
    claims: { statedMonthlyIncome: L.claims?.statedMonthlyIncome ?? null, statedYieldPercent: L.claims?.statedYieldPercent ?? null, units: L.claims?.units ?? null, shortTermUnits: L.claims?.shortTermUnits ?? null, tenantedUnits: L.claims?.tenantedUnits ?? null },
  };
}
