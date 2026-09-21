import type { Listing } from './types.js';

export interface Signal { code: string; evidence: string; meaning: string; action: string }
export interface Claims { statedMonthlyIncome?: number; statedYieldPercent?: number; units?: number; shortTermUnits?: number; tenantedUnits?: number }
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const count = (s: string) => WORDS[s.toLowerCase()] ?? Number(s);
const clip = (s: string) => s.replace(/\s+/g, ' ').trim().split(' ').slice(0, 12).join(' ');
const money = (s?: string) => { const v = s ? Number(s.replace(/[^\d]/g, '')) : NaN; return v > 0 ? v : undefined; };

/**
 * Reads the listing text like an investigator: what is claimed, what it implies, and what to check.
 * Only short evidence phrases are returned, never the marketing copy. Patterns are specific so navigation menus cannot trigger them.
 */
export function readSignals(T: string, L: Listing): { signals: Signal[]; claims: Claims } {
  const signals: Signal[] = [], claims: Claims = {};
  const add = (code: string, ev: string, meaning: string, action: string) => signals.push({ code, evidence: clip(ev), meaning, action });
  const m = (re: RegExp) => T.match(re);

  if (L.status === 'under_offer') add('UNDER_OFFER', 'Under Offer', 'An offer has been accepted, though it may still be conditional.', 'Ask whether the offer is unconditional and whether the agent takes back-up offers.');

  const units = m(/\b(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\s+(?:individual\s+|separate\s+|self-contained\s+)?(studio|flat|suite|unit|apartment|bedsit|cottage)s?\b/i);
  if (units && count(units[1]) >= 2 && count(units[1]) <= 12) {
    claims.units = count(units[1]);
    add('MULTI_UNIT', units[0], `Marketed as ${claims.units} self-contained units in one building.`, 'Confirm the approved plans and what the zoning allows in dwelling units.');
  }
  const st = m(/airbnb|short[- ]term (?:let|letting|rental|accommodation)|holiday (?:let|letting|rental)|guest ?house|booking\.com/i);
  if (st) {
    const n = m(/\b(one|two|three|four|five|\d)\s+of the\s+(?:suites|units|studios|flats|apartments|rooms)[^.]{0,60}?(?:airbnb|short[- ]term|holiday|guest)/i);
    if (n) claims.shortTermUnits = count(n[1]);
    add('SHORT_TERM_LETTING', st[0], claims.shortTermUnits ? `${claims.shortTermUnits} unit(s) are let short-term.` : 'Short-term letting is part of the income.', 'Ask for platform payout statements, booking calendars and proof the use is permitted.');
  }
  const tn = m(/(?:long[- ]term|existing|current)\s+tenants?|tenanted|currently (?:let|leased|rented)|let to\b/i);
  if (tn) { claims.tenantedUnits = 1; add('TENANT_IN_PLACE', tn[0], 'A tenant occupies part of the property.', 'Get the lease, deposit, arrears and notice terms.'); }

  const inc = m(/(?:average )?monthly (?:rental )?income of (?:approximately |about |around |roughly )?R\s?(\d[\d\s,]*)/i);
  if (inc) claims.statedMonthlyIncome = money(inc[1]);
  const yl = m(/yield\s+(?:of\s+)?(?:exceeding|above|over|up to|around)?\s*(\d+(?:[.,]\d+)?)\s*%/i);
  if (yl) claims.statedYieldPercent = Number(yl[1].replace(',', '.'));
  if (inc || yl) add('INCOME_CLAIM', inc?.[0] ?? yl![0], 'The income and yield come from the marketing text, not from statements.', 'Ask for 12 to 24 months of income evidence and the costs that were deducted, if any.');

  const rules: [string, RegExp, string, string][] = [
    ['FIBRE_READY', /fibre[- ]?ready/i, 'Fibre-ready usually means the infrastructure is in the street or complex, not that a line is connected.', 'Ask which provider serves the address and what the connection costs.'],
    ['PERIOD_BUILDING', /victorian|edwardian|art deco|heritage/i, 'A period building, probably over 60 years old.', 'Check heritage protection and the permit history for any alterations.'],
    ['CONDITION_WORK_NEEDED', /needs (?:some )?(?:tlc|renovation|work|updating|refurbishment)|fixer[- ]upper|handyman|sold voetstoots|as[- ]is basis/i, 'The seller signals work is needed or gives no warranty.', 'Commission a full inspection and price the repairs before offering.'],
    ['SELLER_URGENCY', /motivated seller|must (?:be )?sold?|urgent sale|priced to sell|price reduced|bring (?:an )?offer|all offers considered/i, 'The wording suggests seller flexibility.', 'Ask how long it has been listed and what offers have been received.'],
    ['SECONDARY_DWELLING', /flatlet|granny flat|second dwelling|separate entrance/i, 'A second dwelling or flatlet is mentioned.', 'Confirm it is on the approved plans and allowed by the zoning.'],
    ['DEVELOPMENT_CLAIM', /development potential|subdivi|commercial rights|zoned (?:business|commercial|mixed)/i, 'A development or commercial-use claim is made.', 'Verify the zoning and overlays yourself; do not rely on the listing.'],
    ['DEFECT_MENTIONED', /\b(?:rising )?damp\b|leak(?:s|ing)?\b|asbestos|borer|subsidence|structural crack/i, 'A defect or hazard is mentioned.', 'Inspect it and price the repair.'],
  ];
  for (const [code, re, meaning, action] of rules) { const x = m(re); if (x) add(code, x[0], meaning, action); }
  return { signals, claims };
}
