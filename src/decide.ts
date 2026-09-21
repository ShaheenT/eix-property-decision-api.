import type { Listing, Comp, Profile } from './types.js';
import { estimate, type EstOk } from './comps.js';

export const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const pmt = (loan: number, ratePct: number, years: number) => {
  const i = ratePct / 1200, k = years * 12;
  return i ? (loan * i) / (1 - (1 + i) ** -k) : loan / k;
};
/** SARS transfer duty, effective 1 Apr 2025 and unchanged for 2026/27. */
export const transferDuty = (v: number) => {
  const t: [number, number, number][] = [[13_310_000, 1_241_456, .13], [2_994_800, 106_784, .11], [2_329_300, 53_544, .08], [1_663_800, 13_614, .06], [1_210_000, 0, .03]];
  for (const [from, base, rate] of t) if (v > from) return Math.round(base + (v - from) * rate);
  return 0;
};

const Rz = (n: number) => 'R ' + Math.round(n).toLocaleString('en-ZA');
/** Cape Town residential rates: (market value - rates-free threshold) x rate. Sources conflict for 2026/27, so we bracket. */
const CT = [{ rate: .007159, exempt: 450_000 }, { rate: .007010, exempt: 605_000 }, { rate: .006428, exempt: 620_000 }];
export const impliedValue = (rates: number) => { const v = CT.map(t => rates * 12 / t.rate + t.exempt); return { low: Math.min(...v), high: Math.max(...v) }; };

/** Rental economics. Net yield and cash flow allow 5% vacancy, 1% upkeep, rates and levy. */
export const rentEconomics = (price: number, rent: number, monthly: number, fixedMonthly: number) => ({
  grossYield: rent * 12 / price,
  netYield: (rent * 12 * 0.95 - fixedMonthly * 12 - price * 0.01) / price,
  cashflow: rent * 0.95 - monthly,
});

/** Security or country estates carry homeowners-association rules and levies even on freehold title. */
export const isEstate = (L: Listing) => /\bestate\b/i.test(L.suburb ?? '');

export type Flag = { code: string; level: 'high' | 'medium' | 'info'; text: string };

export function decide(L: Listing, p: Profile, comps: Comp[] = []) {
  if (!L.price) throw new Error('No asking price found. Supply the asking price manually.');
  const price = L.price;
  const deposit = price * p.depositPct / 100, loan = price - deposit;
  const bond = pmt(loan, p.rate, p.termYears), bondPlus1 = pmt(loan, p.rate + 1, p.termYears);
  const duty = p.vatSale ? 0 : transferDuty(price);
  const fees = price * 0.03;            // guideline: attorney, deeds office and bond registration, excl. duty
  const reserve = price * 0.01 / 12;    // rule of thumb: 1% of value per year for maintenance
  const monthly = bond + (L.rates ?? 0) + (L.levy ?? 0) + reserve;
  const incomeNeeded = bond / 0.3;      // lenders commonly cap the instalment near 30% of gross income

  const perFloor = L.floorSqm ? price / L.floorSqm : undefined;
  const perErf = L.erfSqm ? price / L.erfSqm : undefined;
  const coverage = L.floorSqm && L.erfSqm ? L.floorSqm / L.erfSqm : undefined;

  const ok = comps.filter(c => c.price > 0);
  const est = ok.length ? estimate(ok.map(c => ({ value: c.price, floorSqm: c.floorSqm, erfSqm: c.erfSqm, beds: c.beds, type: c.propertyType, date: c.date, kind: c.kind })), { floorSqm: L.floorSqm, erfSqm: L.erfSqm, beds: L.beds, type: L.propertyType }) : undefined;
  const compNote = !est ? undefined : est.strength === 'insufficient' ? `Only ${est.used} of ${ok.length} comparables are similar enough (same type, similar size, recent). Add closer matches.` : est.strength === 'weak' ? `The comparables are too spread out to set a benchmark (their middle half spans ${Math.round(est.dispersion * 100)}% of the median). Add closer matches.` : undefined;
  let bench: { n: number; basis: string; value: number; gap: number; position: 'above' | 'in line' | 'below'; strength: 'strong' | 'moderate'; low: number; est: EstOk } | undefined;
  if (est && (est.strength === 'strong' || est.strength === 'moderate')) {
    const gap = (price - est.value) / est.value;
    bench = { n: est.used, basis: est.basis === 'per_m2' ? 'median R/m² of floor area' : 'median sale price', value: est.value, gap, low: Math.min(est.value * 0.95, est.low), position: gap > .07 ? 'above' : gap < -.07 ? 'below' : 'in line', strength: est.strength, est };
  }

  const bondRatio = p.grossIncome ? bond / p.grossIncome : undefined;
  const status = bondRatio && bondRatio > .33 ? 'Affordability stretch'
    : !bench ? 'Gather evidence'
    : bench.position === 'above' ? 'Negotiate' : bench.position === 'below' ? 'Priced below benchmark' : 'Priced in line';
  const summary: Record<string, string> = {
    'Affordability stretch': 'The instalment is above about a third of your gross income. Check what a lender would actually approve before viewing further.',
    'Gather evidence': 'Nothing here proves the price is fair yet. Add recent comparable sales before you make an offer.',
    'Negotiate': 'Asking is meaningfully above the comparable benchmark. There is a case for negotiating, backed by the sales you supplied.',
    'Priced below benchmark': 'Asking is below the comparable benchmark. Find out why: condition, defects, title issues or a motivated seller.',
    'Priced in line': 'Asking is close to the comparable benchmark. Condition and running costs now decide the offer.',
  };

  const flags: Flag[] = [];
  if (!L.floorSqm) flags.push({ code: 'FLOOR_AREA_MISSING', level: 'medium', text: 'Floor size is missing, so R/m² comparisons are not possible. Ask the agent for the measured floor area.' });
  if (L.titleType === 'unknown') flags.push({ code: 'TITLE_TYPE_UNKNOWN', level: 'medium', text: 'Title type is unclear. Freehold and sectional title carry very different costs and rules, so confirm which this is.' });
  if (L.levy === undefined && (L.titleType !== 'freehold' || isEstate(L))) flags.push({ code: 'LEVY_NOT_STATED', level: L.titleType === 'sectional' ? 'high' : 'medium', text: isEstate(L) ? 'No levy is stated. Homeowners association levies in an estate can add thousands a month; also ask about special levies and the reserve.' : 'No levy is stated. Sectional title levies can add thousands a month; also ask about special levies and the reserve fund.' });
  if (coverage && coverage > .8 && coverage <= 1) flags.push({ code: 'HIGH_SITE_COVERAGE', level: 'medium', text: `Building covers about ${Math.round(coverage * 100)}% of the erf, leaving little outdoor space or room to extend.` });
  if (coverage && coverage > 1) flags.push({ code: 'FLOOR_EXCEEDS_ERF', level: 'info', text: `Floor area is ${coverage.toFixed(1)} times the erf, so this is a multi-storey building or a data error. Confirm both measurements against the title deed and the plans.` });
  if (L.beds && L.baths && L.baths >= L.beds && L.titleType !== 'sectional') flags.push({ code: 'POSSIBLE_UNAPPROVED_ADDITIONS', level: 'info', text: 'Bathrooms match or exceed bedrooms, which often follows renovations. Ask for approved building plans and confirm all additions are on them.' });
  if (!L.features.some(f => /solar|inverter|generator|borehole/.test(f))) flags.push({ code: 'NO_BACKUP_POWER_OR_WATER', level: 'info', text: 'No backup power or water is listed. Budget for an inverter or solar if load-shedding or outages matter to you.' });
  if (p.depositPct < 10) flags.push({ code: 'LOW_DEPOSIT', level: 'medium', text: 'A deposit below 10% may mean a higher rate or a tighter approval.' });
  if (bondRatio && bondRatio > .3) flags.push({ code: 'HIGH_BOND_TO_INCOME', level: 'high', text: `The instalment is ${Math.round(bondRatio * 100)}% of your gross income. Lenders typically want closer to 30%.` });
  if (!bench) flags.push({ code: 'NO_COMPARABLES', level: 'high', text: compNote ?? 'No comparable sales supplied: price fairness is unproven.' });

  const cl = L.claims, sigs = new Set((L.signals ?? []).map(x => x.code));
  if (cl?.units && cl.units >= 2 && L.titleType !== 'sectional') flags.push({ code: 'MULTI_UNIT_CONVERSION', level: 'high', text: `Marketed as ${cl.units} self-contained units in a house. Confirm the approved plans and zoning allow that many dwelling units; an unapproved conversion can be ordered reversed and can affect insurance and your bond.` });
  if (sigs.has('SHORT_TERM_LETTING')) flags.push({ code: 'SHORT_TERM_LETTING_IN_USE', level: 'medium', text: p.city === 'ct' ? 'Part of the property is let short-term. In Cape Town this can need Consent Use approval, a draft Short-Term Letting By-Law is expected to add registration, and the City has proposed commercial rates for properties let short-term over half the year from 1 July 2027. Income also carries tax duties. Reviews and bookings do not transfer with the sale.' : 'Part of the property is let short-term. Check the zoning and any local rules permit it, insurance cover, tax duties, and that the income is evidenced. Reviews and bookings do not transfer with the sale.' });
  if (sigs.has('TENANT_IN_PLACE')) flags.push({ code: 'TENANT_IN_OCCUPATION', level: 'medium', text: 'A tenant is in occupation. Get the lease, deposit and notice terms; an existing lease generally continues after a sale, so confirm your position with your conveyancer.' });
  if (cl?.statedMonthlyIncome) {
    flags.push({ code: 'INCOME_CLAIM_UNVERIFIED', level: 'medium', text: `The listing states an income of R ${cl.statedMonthlyIncome.toLocaleString('en-ZA')} a month. That is the agent's figure, not evidence, and it is normally gross.` });
    if (cl.statedMonthlyIncome < bond) flags.push({ code: 'INCOME_BELOW_BOND', level: 'high', text: `The stated income does not cover the bond of R ${Math.round(bond).toLocaleString('en-ZA')} at your deposit and rate, before rates, insurance, upkeep or operating costs.` });
  }
  if (L.status === 'under_offer') flags.push({ code: 'LISTING_UNDER_OFFER', level: 'info', text: 'The listing is under offer. Ask whether that offer is unconditional and whether back-up offers are taken.' });
  const days = L.listedDate ? Math.floor((Date.now() - Date.parse(L.listedDate)) / 864e5) : undefined;
  if (days !== undefined && days > 120 && L.status !== 'under_offer') flags.push({ code: 'LONG_TIME_ON_MARKET', level: 'info', text: `Listed ${days} days ago. Ask why it has not sold and what offers were refused.` });
  const questions = [
    'What did similar homes on this street sell for in the last 12 months, and how long did they take to sell?',
    'Why is the owner selling, and how long has it been on the market? Has the price dropped?',
    L.titleType === 'sectional' || L.titleType === 'unknown' ? 'What are the monthly levies, any special levies, and is the body corporate financially healthy (minutes and financials)?' : 'Are there any servitudes or building-line restrictions on the title deed?',
    'Are there approved building plans and an occupancy certificate for the whole structure?',
    'Are there electrical, plumbing, beetle, damp and roof compliance certificates, and who pays for them?',
    'What is included in the sale (fittings, appliances, solar, alarm)? What is the occupation date?',
    ...(!L.floorSqm ? ['What is the measured floor area?'] : []),
    ...(cl?.units ? [`Are all ${cl.units} units on the approved plans, and what does the zoning allow?`] : []),
    ...(cl?.statedMonthlyIncome ? [`What period does the R ${cl.statedMonthlyIncome.toLocaleString('en-ZA')} average cover, is it gross, and can you show the statements?`] : []),
    ...(sigs.has('SHORT_TERM_LETTING') ? ['Can you provide 12 to 24 months of platform payout statements and confirm the letting is permitted by the zoning?'] : []),
    ...(sigs.has('TENANT_IN_PLACE') ? ['What are the lease terms, deposit held and notice period for the tenant?'] : []),
    ...(L.status === 'under_offer' ? ['Is the current offer unconditional, and will you take a back-up offer?'] : []),
  ];

  const has = (k: keyof Listing) => L[k] !== undefined || (k === 'levy' && L.titleType === 'freehold');
  const keys: (keyof Listing)[] = ['price', 'floorSqm', 'erfSqm', 'rates', 'levy', 'beds', 'baths'];
  const readiness = Math.round(keys.filter(has).length / keys.length * 55) + (L.titleType !== 'unknown' ? 5 : 0) + (bench ? (bench.strength === 'strong' ? 40 : 25) : 0);

  const rent = p.monthlyRent ? rentEconomics(price, p.monthlyRent, monthly, (L.rates ?? 0) + (L.levy ?? 0)) : undefined;

  const interest1 = loan * p.rate / 1200, principal1 = bond - interest1;
  const ownCost = interest1 + (L.rates ?? 0) + (L.levy ?? 0) + reserve;   // owning cost before principal
  const uplift = (1 + (duty + fees) / price) / (1 - 0.06) - 1;             // assumes ~6% selling costs
  const breakEven = [3, 6, 9].map(g => ({ g, years: Math.log(1 + uplift) / Math.log(1 + g / 100) }));
  const grid = [0, 10, 20].map(dep => ({ dep, cells: [-1, 0, 1, 2].map(dr => pmt(price * (1 - dep / 100), p.rate + dr, p.termYears)) }));
  const implied = p.city === 'ct' && L.rates ? impliedValue(L.rates) : undefined;
  if (implied && price > implied.high * 1.05) flags.push({ code: 'ABOVE_MUNICIPAL_VALUE', level: 'medium', text: `Asking is ${Math.round((price / implied.high - 1) * 100)}% to ${Math.round((price / implied.low - 1) * 100)}% above the ${Rz(implied.low)} to ${Rz(implied.high)} municipal value implied by the rates bill. Municipal values lag the market, so this is not proof of overpricing, but it is a reason to see recent sales before offering.` });
  if (L.features.some(f => /victorian|fireplace|wooden floors|sash|pressed ceiling/.test(f))) flags.push({ code: 'OLDER_PROPERTY', level: 'medium', text: 'Period features suggest an older house. Budget for roof, damp, wiring, plumbing and timber-pest checks, and ask whether heritage rules limit alterations (structures over 60 years old generally need a permit under the National Heritage Resources Act).' });
  const plan = [
    `Get a bond pre-approval first. This price needs about ${Rz(incomeNeeded)} gross a month at 30%, and ${Rz(pmt(loan, p.rate + 2, p.termYears) / 0.3)} if rates rise 2 points.`,
    bench ? 'Use your comparable sales in the offer, and keep the list to show the agent.' : `Get 3 to 6 recent sales of similar homes nearby (agent, Lightstone or Windeed) and add them as comparables.${implied ? ' Also check the City valuation roll for this address.' : ''}`,
    'Make the offer subject to a building inspection and the compliance certificates below, not just to bond approval.',
  ];
  return { interest1, principal1, ownCost, uplift, breakEven, grid, implied, plan, ct: p.city === 'ct', L, p, price, deposit, loan, bond, bondPlus1, duty, fees, reserve, monthly, incomeNeeded, bondRatio, perFloor, perErf, coverage, bench, status, summary: summary[status], flags, questions, readiness, rent, upfront: deposit + duty + fees };
}
export type Decision = ReturnType<typeof decide>;
