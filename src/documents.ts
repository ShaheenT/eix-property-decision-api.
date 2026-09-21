import { isEstate, type Decision } from './decide.js';

/** Date the Cape Town entries were checked against City of Cape Town pages. */
export const DOCS_VERIFIED = '2026-09-20';
type Stage = 'before_offer' | 'with_offer' | 'before_signing' | 'during_transfer';
const STAGES: Stage[] = ['before_offer', 'with_offer', 'before_signing', 'during_transfer'];
const CT = {
  roll: 'https://www.capetown.gov.za/propertyvaluations',
  viewer: 'https://citymaps.capetown.gov.za/EGISViewer/',
  plans: 'https://www.capetown.gov.za/City-Connect/Apply/Planning-building-and-development/Building-plan-applications/Apply-for-copies-of-building-plans',
};
interface Item {
  id: string; title: string; priority: 'essential' | 'recommended'; stage: Stage;
  whoGetsIt: 'you' | 'seller' | 'conveyancer' | 'agent';
  cost: { type: 'free' | 'paid' | 'seller_pays' | 'in_transfer_costs'; note: string };
  why: string; howToGet: string; url: string | null; resolvesRisks: string[]; basis: 'verified_source' | 'standard_practice';
}

/** Which documents this buyer should get, why, from whom, at what cost, and which report risks each one settles. */
export function buildDocumentPack(d: Decision) {
  const codes = new Set(d.flags.map(f => f.code)), ct = d.p.city === 'ct', sectional = d.L.titleType === 'sectional', unknown = d.L.titleType === 'unknown', older = codes.has('OLDER_PROPERTY'), estate = isEstate(d.L), multi = codes.has('MULTI_UNIT_CONVERSION'), stl = codes.has('SHORT_TERM_LETTING_IN_USE'), tenant = codes.has('TENANT_IN_OCCUPATION');
  const items: Item[] = [];
  const add = (i: Omit<Item, 'resolvesRisks' | 'basis'> & { resolves?: string[]; verified?: boolean }) => {
    const { resolves = [], verified = false, ...rest } = i;
    items.push({ ...rest, resolvesRisks: resolves.filter(c => codes.has(c)), basis: verified ? 'verified_source' : 'standard_practice' });
  };

  add({ id: 'valuation_roll', title: 'Municipal valuation roll entry', priority: 'essential', stage: 'before_offer', whoGetsIt: 'you',
    cost: { type: 'free', note: 'Free to view online' },
    why: 'The municipality\'s official value for the property and the rates it implies. Compare it with the asking price and with the rates figure on the listing.',
    howToGet: ct ? 'Search by erf number, address or sectional title details, then view the valuation and estimate the monthly rates. The 2025 roll (values at 1 July 2025) applies from 1 July 2026, so the rates on the listing may still reflect the earlier roll.' : 'Municipalities must make their valuation roll available for public inspection. Search for your municipality\'s valuation roll online, or ask its rates department.',
    url: ct ? CT.roll : null, resolves: ['ABOVE_MUNICIPAL_VALUE', 'NO_COMPARABLES'], verified: ct });
  add({ id: 'zoning_overlay', title: 'Zoning and overlay check', priority: multi || stl ? 'essential' : 'recommended', stage: 'before_offer', whoGetsIt: 'you',
    cost: { type: 'free', note: ct ? 'Free online viewer' : 'Ask the municipality; usually free' },
    why: 'Confirms the zoning, any overlays and current building or land-use cases. This decides what you can extend, add or let (second dwelling, guesthouse, home business).',
    howToGet: ct ? 'Open the City Map and Zoning Viewer, accept the disclaimer, search by erf number or address and switch on the zoning layers. Zoning names SR1 and SR2 became R1 and R2 on 1 October 2025 and the viewer is still being updated.' : 'Ask the municipality\'s planning or land-use department for the erf\'s zoning and overlays.',
    url: ct ? CT.viewer : null, verified: ct });
  add({ id: 'heritage_status', title: 'Heritage status check', priority: older ? 'essential' : 'recommended', stage: 'before_offer', whoGetsIt: 'you',
    cost: { type: 'free', note: ct ? 'Free online viewer' : 'Ask the municipality or provincial heritage authority' },
    why: 'Listed heritage properties and Heritage Protection Overlay Zones need heritage consent for changes, and structures over 60 years old generally need a permit to alter. It limits renovations and can add cost and delay.',
    howToGet: ct ? 'In the City Map Viewer check the heritage layers (Heritage Register and Heritage Protection Overlay Zone) for the erf, or ask the City\'s heritage team.' : 'Ask the municipality or the provincial heritage resources authority whether the property or area is protected.',
    url: ct ? CT.viewer : null, resolves: ['OLDER_PROPERTY'], verified: ct });
  if (ct && older) add({ id: 'heritage_permit_history', title: 'Heritage permit history', priority: 'essential', stage: 'before_offer', whoGetsIt: 'you',
    cost: { type: 'free', note: 'Committee agendas are published; the seller holds the permits' },
    why: 'Buildings over 60 years old need a Heritage Western Cape permit for alterations, and permits carry conditions. Alterations without one are illegal and can bring fines. Public committee agendas name properties and erf numbers, so past applications can be found.',
    howToGet: 'Search Heritage Western Cape\'s published committee agendas and decisions for the street address and erf number, then ask the seller for the permits and proof that the conditions were met and the work matches them.',
    url: 'https://www.hwc.org.za', resolves: ['OLDER_PROPERTY', 'MULTI_UNIT_CONVERSION'], verified: true });
  if (tenant || multi) add({ id: 'lease_agreements', title: 'Lease agreements and tenant records', priority: 'essential', stage: 'before_offer', whoGetsIt: 'seller',
    cost: { type: 'free', note: 'The seller holds them' },
    why: 'An existing lease generally continues after a sale, so you inherit its rent, term and deposit. The leases also test the income claim.',
    howToGet: 'Ask for every lease, the deposit held, payment history and any notices. Have your conveyancer confirm how the sale treats each lease.', url: null, resolves: ['TENANT_IN_OCCUPATION', 'MULTI_UNIT_CONVERSION'] });
  if (stl) add({ id: 'short_term_letting_evidence', title: 'Short-term letting evidence and compliance', priority: 'essential', stage: 'before_offer', whoGetsIt: 'seller',
    cost: { type: 'free', note: 'The seller holds them' },
    why: 'Listing income is a claim. Platform payout statements show what was really earned. In Cape Town short-term accommodation can need Consent Use, a draft Short-Term Letting By-Law announced in February 2026 is expected to add registration, and the City has proposed commercial rates for properties let short-term over half the year from 1 July 2027. Income tax applies, and VAT registration becomes compulsory above R1 million turnover in 12 months.',
    howToGet: 'Ask for 12 to 24 months of platform payout statements and booking calendars, the tax records, the insurance schedule, and proof of any zoning consent. Ask the City\'s rates department which rating category applies now and what is proposed.',
    url: null, resolves: ['SHORT_TERM_LETTING_IN_USE', 'INCOME_CLAIM_UNVERIFIED', 'INCOME_BELOW_BOND'], verified: ct });
  add({ id: 'rates_account', title: 'Latest rates and services account', priority: 'essential', stage: 'before_offer', whoGetsIt: 'seller',
    cost: { type: 'free', note: 'The seller has it' },
    why: 'Shows the real monthly rates and utility charges and any arrears, and whether the listing\'s rates figure is current.',
    howToGet: 'Ask the agent for the seller\'s latest municipal statement before you offer.', url: null, resolves: ['ABOVE_MUNICIPAL_VALUE'] });
  add({ id: 'comparable_sales', title: 'Recent sales and rentals nearby', priority: codes.has('NO_COMPARABLES') ? 'essential' : 'recommended', stage: 'before_offer', whoGetsIt: 'agent',
    cost: { type: 'paid', note: 'Free from an agent; deeds-based reports (Lightstone, Windeed) are paid' },
    why: 'The evidence that tells you whether the asking price is fair. Three to six similar recent sales let this report benchmark the price.',
    howToGet: 'Ask any agent for recent sold prices on nearby streets, or buy a deeds-based report. Add them to the request as comparables.', url: null, resolves: ['NO_COMPARABLES'] });
  add({ id: 'bond_preapproval', title: 'Bond pre-approval', priority: 'essential', stage: 'before_offer', whoGetsIt: 'you',
    cost: { type: 'free', note: 'Usually free through a bank or bond originator' },
    why: 'Confirms what a lender will actually approve at today\'s rate, which decides whether this price is within reach and strengthens your offer.',
    howToGet: 'Apply to a bank or bond originator with your payslips and bank statements. Compare the approved amount with the income required in this report.', url: null, resolves: ['HIGH_BOND_TO_INCOME', 'LOW_DEPOSIT'] });
  if (estate) add({ id: 'hoa_pack', title: 'Homeowners association pack', priority: 'essential', stage: 'before_offer', whoGetsIt: 'agent',
    cost: { type: 'free', note: 'Usually supplied through the agent or the estate managing agent' },
    why: 'In an estate the association sets the levy, the security and access rules and the design guidelines for alterations. Its finances and any planned special levies affect what you will pay and what you may build.',
    howToGet: 'Ask for the association constitution or memorandum of incorporation, the rules and architectural design guidelines, the latest financial statements and budget, the levy statement including any special levies, and confirmation of any arrears on the property.',
    url: null, resolves: ['LEVY_NOT_STATED', 'TITLE_TYPE_UNKNOWN'] });
  if (estate) add({ id: 'hoa_clearance', title: 'Association levy clearance', priority: 'essential', stage: 'during_transfer', whoGetsIt: 'conveyancer',
    cost: { type: 'in_transfer_costs', note: 'Part of the transfer costs' },
    why: 'Estates typically require a clearance from the association before transfer, confirming the seller owes it nothing. Delays here delay your move-in.',
    howToGet: 'The seller\'s conveyancer requests it from the association. Ask your conveyancer to confirm it is in hand.', url: null });
  if (sectional || (unknown && !estate)) add({ id: 'body_corporate_pack', title: 'Body corporate pack', priority: sectional ? 'essential' : 'recommended', stage: 'before_offer', whoGetsIt: 'agent',
    cost: { type: 'free', note: 'Usually supplied through the agent or managing agent' },
    why: 'You buy a share of the whole scheme. The audited financial statements show the reserve fund and owners in arrears, the AGM minutes show disputes and planned special levies, and the rules show what you may and may not do.',
    howToGet: `${sectional ? '' : 'If this is sectional title: '}ask for the latest audited financial statements, the last AGM minutes, the management and conduct rules, the sectional plan (to see what is common property or exclusive use), the insurance schedule and the levy statement including any special levies.`,
    url: null, resolves: ['LEVY_NOT_STATED', 'TITLE_TYPE_UNKNOWN'], verified: true });
  add({ id: 'compliance_certificates', title: 'Compliance certificates', priority: 'essential', stage: 'with_offer', whoGetsIt: 'seller',
    cost: { type: 'seller_pays', note: 'Normally the seller pays; agree it in the offer' },
    why: 'The electrical certificate is a legal requirement on sale. Plumbing and beetle certificates are standard in Western Cape sales, and gas and electric fence certificates apply where fitted. Failures can mean costly repairs.',
    howToGet: 'Ask the agent which certificates the seller will supply, and write them into the offer to purchase as conditions.', url: null, resolves: ['OLDER_PROPERTY', 'POSSIBLE_UNAPPROVED_ADDITIONS'] });
  add({ id: 'building_plans', title: 'Approved building plans', priority: codes.has('POSSIBLE_UNAPPROVED_ADDITIONS') || older || multi ? 'essential' : 'recommended', stage: 'with_offer', whoGetsIt: 'seller',
    cost: { type: 'paid', note: ct ? 'Small search fee set in the City\'s tariff (reported as R140 to R300); usually paid by the owner' : 'Small municipal search fee, usually paid by the owner' },
    why: 'Proves every room and extension was approved. Unapproved additions can hold up a sale, insurance or a later bond and can force costly rectification.',
    howToGet: ct ? 'Only the registered owner or an authorised architect or draughtsperson can get copies. Ask the seller to request them through the City\'s e-Services, or to authorise you in writing (third-party requests go through a District Information Hub). Make the offer conditional on plans that match the building.' : 'Ask the seller to obtain copies from the municipality\'s building control office; usually only the owner or an authorised person can request them.',
    url: ct ? CT.plans : null, resolves: ['POSSIBLE_UNAPPROVED_ADDITIONS', 'OLDER_PROPERTY'], verified: ct });
  add({ id: 'inspection', title: 'Independent building inspection', priority: older || multi ? 'essential' : 'recommended', stage: 'before_signing', whoGetsIt: 'you',
    cost: { type: 'paid', note: 'You pay the inspector' },
    why: 'Finds roof, damp, wiring, plumbing and timber-pest problems that no certificate or listing shows, and gives you evidence to renegotiate.',
    howToGet: 'Hire an independent inspector and make the offer subject to a satisfactory report.', url: null, resolves: ['OLDER_PROPERTY', 'POSSIBLE_UNAPPROVED_ADDITIONS'] });
  add({ id: 'title_deed', title: 'Title deed and conditions of title', priority: 'recommended', stage: 'before_signing', whoGetsIt: 'conveyancer',
    cost: { type: 'paid', note: 'Deeds search is a conveyancing cost' },
    why: 'Shows the registered owner, bonds, servitudes and restrictions, and confirms the seller can sell.',
    howToGet: 'Ask your conveyancer to run a deeds search and read the conditions of title before you sign.', url: null, resolves: ['TITLE_TYPE_UNKNOWN'] });
  add({ id: 'rates_clearance', title: 'Rates clearance certificate', priority: 'essential', stage: 'during_transfer', whoGetsIt: 'conveyancer',
    cost: { type: 'in_transfer_costs', note: 'Part of the transfer costs; the seller settles any arrears' },
    why: 'Transfer cannot be registered without it (section 118 of the Municipal Systems Act). It confirms the seller has paid municipal charges for the previous 24 months and is valid for 60 days. Delays here delay your move-in.',
    howToGet: 'The seller\'s conveyancer applies to the municipality. There is nothing for you to submit; ask for an update if transfer stalls.', url: null, verified: true });
  if (sectional) add({ id: 'levy_clearance', title: 'Levy clearance certificate', priority: 'essential', stage: 'during_transfer', whoGetsIt: 'conveyancer',
    cost: { type: 'in_transfer_costs', note: 'Part of the transfer costs' },
    why: 'Required before a sectional title transfer can be registered. It confirms the seller owes the body corporate nothing, or has made arrangements, so you do not start with the seller\'s levy debt.',
    howToGet: 'The conveyancer obtains it from the managing agent or trustees. Ask for confirmation that it is in hand.', url: null, verified: true });

  items.sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || (a.priority === b.priority ? 0 : a.priority === 'essential' ? -1 : 1));
  return {
    jurisdiction: ct ? 'cape_town' : 'other', lastVerified: DOCS_VERIFIED,
    summary: { total: items.length, free: items.filter(i => i.cost.type === 'free').length, essential: items.filter(i => i.priority === 'essential').length },
    items,
    notes: [
      'This pack says what to get and how. The API does not fetch municipal documents: most are released only to the owner, the seller\'s attorney or through an interactive municipal search.',
      'Procedures and fees change. Cape Town entries were checked against City of Cape Town pages on the date shown; other entries reflect standard South African practice, so confirm with your conveyancer.',
      ...(ct ? [] : ['Direct municipal links are included for Cape Town only so far.']),
    ],
  };
}
