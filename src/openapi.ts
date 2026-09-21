const t = (type: string | string[], extra: object = {}) => ({ type, ...extra });
const num = t('number'), int = t('integer'), str = t('string'), nnum = t(['number', 'null']), nstr = t(['string', 'null']);
const obj = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const arr = (items: unknown) => ({ type: 'array', items });
const en = (...v: string[]) => ({ type: 'string', enum: v });
const ref = (n: string) => ({ $ref: `#/components/schemas/${n}` });
const orNull = (s: unknown) => ({ oneOf: [{ type: 'null' }, s] });
const problem = (description: string) => ({ description, content: { 'application/problem+json': { schema: ref('Problem') } } });

const schemas = {
  Problem: obj({ type: str, title: str, status: int, code: str, detail: str, requestId: str, errors: arr(obj({ field: str, message: str })) }, ['type', 'title', 'status', 'code', 'detail', 'requestId']),
  Property: obj({ askingPrice: num, bedrooms: int, bathrooms: num, parking: int, floorAreaM2: num, erfM2: num, ratesMonthly: num, levyMonthly: num, propertyType: str, titleType: en('freehold', 'sectional', 'unknown'), suburb: str, city: str, title: str, features: arr(str) }, ['askingPrice']),
  Buyer: obj({ profile: en('first_time', 'investor', 'upgrader'), depositPercent: num, interestRate: num, termYears: int, grossMonthlyIncome: num, expectedMonthlyRent: num, vatSale: t('boolean') }, []),
  Comparable: obj({ price: num, floorAreaM2: num, erfM2: num, bedrooms: int, propertyType: str, priceType: en('sold', 'asking'), soldDate: str, address: str, sourceUrl: str, suburb: str }, ['price']),
  RentalComparable: obj({ monthlyRent: num, floorAreaM2: num, bedrooms: int, propertyType: str, listedDate: str, address: str, sourceUrl: str, suburb: str }, ['monthlyRent']),
  ExtractRequest: obj({ items: arr(obj({ url: str, html: str }, ['url'])) }),
  ExtractResponse: obj({ sales: arr(ref('Comparable')), rentals: arr(ref('RentalComparable')), skipped: arr(obj({ url: str, reason: str })) }),
  Neighbourhood: { ...obj({ location: obj({ lat: num, lng: num }), priorities: { oneOf: [en('balanced', 'family', 'young_professional', 'retiree', 'investor'), { type: 'object', additionalProperties: t('number', { minimum: 0, maximum: 5 }) }] }, metrics: obj({ crimePer100k: num, benchmarkCrimePer100k: num, priceGrowth5yPercent: num, medianDaysOnMarket: num }, []), osm: t('boolean') }, []), description: 'Opt in to the Neighbourhood DNA layer. Coordinates come from the listing (url source) or "location". Crime, price growth and days on market come from your data feed.' },
  DecisionRequest: { ...obj({ property: ref('Property'), url: str, html: str, buyer: ref('Buyer'), comparables: arr(ref('Comparable')), rentalComparables: arr(ref('RentalComparable')), marketData: en('supplied', 'provider'), neighbourhood: ref('Neighbourhood') }, []), description: 'Provide exactly one of "property" (structured facts, no browser needed) or "url" (optionally with "html" you already hold).' },
  DecisionV1: obj({
    id: str, schemaVersion: str, engineVersion: str, generatedAt: str,
    property: obj({ address: nstr, title: nstr, suburb: nstr, city: nstr, propertyType: nstr, titleType: en('freehold', 'sectional', 'unknown'), askingPrice: num }),
    verdict: obj({ code: en('GATHER_EVIDENCE', 'NEGOTIATE', 'PRICED_IN_LINE', 'PRICED_BELOW_BENCHMARK', 'AFFORDABILITY_STRETCH'), status: str, summary: str, readiness: int }),
    scorecard: obj({
      scoringVersion: str,
      investmentScore: obj({ value: t(['integer', 'null']), band: en('Strong', 'Good', 'Fair', 'Weak', 'Poor', 'Insufficient evidence'), provisional: t('boolean'), components: arr(obj({ key: str, label: str, weightPercent: int, score: int, basis: str })) }),
      riskScore: obj({ value: t(['integer', 'null']), band: en('Low', 'Moderate', 'Elevated', 'High', 'Insufficient evidence'), provisional: t('boolean'), drivers: arr(str) }),
      confidence: obj({ percent: int, band: en('Low', 'Moderate', 'High'), areas: arr(obj({ area: str, pts: int, max: int, status: en('established', 'partial', 'missing') })) }),
      decision: obj({ label: en('BUY', 'PROCEED WITH CAUTION', 'NEGOTIATE', 'WALK AWAY'), reasons: arr(str), nextStep: str }),
      rental: orNull(obj({ estimateMonthly: num, lowMonthly: nnum, highMonthly: nnum, basis: en('supplied', 'rent_per_m2', 'rent'), comparablesUsed: int, grossYieldPercent: num, netYieldPercent: num, monthlyCashFlow: num, coversMonthlyCosts: t('boolean') })),
    }),
    neighbourhood: obj({
      status: en('assessed', 'partial', 'not_requested'),
      location: orNull(obj({ lat: num, lng: num, source: en('listing', 'supplied') })),
      archetype: orNull(obj({ label: str, summary: str })),
      dimensions: arr(obj({ key: str, label: str, score: t(['integer', 'null']), source: en('openstreetmap', 'supplied', 'not_established'), evidence: str })),
      fit: orNull(obj({ priorities: str, percent: t(['integer', 'null']), coverage: int, provisional: t('boolean'), strengths: arr(str), tradeoffs: arr(str) })),
      confidencePercent: int, attribution: arr(str),
    }),
    listing: orNull(obj({
      sourceUrl: str, listingNumber: nstr, status: en('listed', 'under_offer'), listedDate: nstr, daysOnMarket: t(['integer', 'null']),
      streetAddress: nstr, agency: nstr, agentName: nstr, receptionRooms: t(['integer', 'null']), parking: t(['integer', 'null']), imageUrl: nstr, features: arr(str),
      pointsOfInterest: arr(obj({ category: str, name: str, distanceKm: num })),
      recentSales: obj({ addresses: arr(obj({ address: str, url: nstr })), pricesAvailable: t('boolean'), note: str }),
      portalCalculator: orNull(obj({ monthlyRepayment: nnum, onceOffCosts: nnum, minGrossMonthlyIncome: nnum, impliedInterestRatePercent: nnum, impliedIncomeRulePercent: nnum, impliedFeesAndBondCosts: nnum, eixFeesEstimate: num, note: str })),
      signals: arr(obj({ code: str, evidence: str, meaning: str, action: str })),
      claims: obj({ statedMonthlyIncome: nnum, statedYieldPercent: nnum, units: t(['integer', 'null']), shortTermUnits: t(['integer', 'null']), tenantedUnits: t(['integer', 'null']) }),
    })),
    incomeTest: orNull(obj({
      basis: en('listing_claim', 'units_only'), statedMonthlyIncome: nnum, statedYieldPercent: nnum, impliedGrossYieldPercent: nnum, netYieldOnClaimPercent: nnum,
      bond: num, coversBond: t(['boolean', 'null']), monthlyShortfallVsBond: nnum, breakEvenMonthlyIncome: num, incomeUpliftNeededPercent: nnum,
      units: t(['integer', 'null']), breakEvenPerUnit: nnum, nightlyRateIfAllShortTerm: arr(obj({ occupancyPercent: num, nightlyRatePerUnit: num })), verdict: str, notes: arr(str),
    })),
    documents: obj({
      jurisdiction: en('cape_town', 'other'), lastVerified: str,
      summary: obj({ total: int, free: int, essential: int }),
      items: arr(obj({
        id: str, title: str, priority: en('essential', 'recommended'), stage: en('before_offer', 'with_offer', 'before_signing', 'during_transfer'),
        whoGetsIt: en('you', 'seller', 'conveyancer', 'agent'), cost: obj({ type: en('free', 'paid', 'seller_pays', 'in_transfer_costs'), note: str }),
        why: str, howToGet: str, url: nstr, resolvesRisks: arr(str), basis: en('verified_source', 'standard_practice'),
      })),
      notes: arr(str),
    }),
    marketData: obj({ source: en('supplied', 'provider', 'none'), status: en('ok', 'empty', 'unavailable', 'not_configured'), salesReceived: int, rentalsReceived: int }),
    displayGuidance: obj({ investmentScore: en('show', 'show_as_provisional', 'hide'), decisionLabel: en('show', 'show_as_provisional', 'hide'), priceVerdict: en('show', 'show_as_provisional', 'hide'), rentEstimate: en('show', 'show_as_provisional', 'hide'), yieldAndCashFlow: en('show', 'show_as_provisional', 'hide'), neighbourhoodFit: en('show', 'show_as_provisional', 'hide'), requiredNotices: arr(str) }),
    assumptions: obj({ vacancyAllowancePercent: num, depositPercent: num, interestRate: num, interestRateAsOf: str, termYears: int, legalAndBondFeesPercent: num, upkeepReservePercentPerYear: num, bondToIncomeRule: num, sellingCostsPercent: num, transferDuty: en('sars_2026_27', 'excluded_vat_sale') }),
    costs: obj({ monthly: obj({ bond: num, rates: nnum, levy: nnum, upkeepReserve: num, total: num }), monthlyExcludes: arr(en('rates', 'levy')), upfront: obj({ deposit: num, transferDuty: num, legalAndBondFees: num, total: num }), incomeRequired: obj({ grossMonthly: num, grossMonthlyIfRatesRise2Points: num }), bondToIncomePercent: nnum }),
    stressTest: obj({ interestRates: arr(num), rows: arr(obj({ depositPercent: num, monthlyBond: arr(num) })) }),
    priceEvidence: obj({
      comparables: orNull(obj({ count: int, basis: en('sale_price', 'price_per_m2_floor'), benchmarkValue: num, gapPercent: num, position: en('above', 'in_line', 'below'), evidenceStrength: en('moderate', 'strong'), effectiveSampleSize: num, dispersionPercent: num, rawDispersionPercent: num, interquartileRange: obj({ low: num, high: num }), excluded: int, outliersDropped: int, askingPriceSharePercent: num, discussionRange: orNull(obj({ low: num, high: num })) })),
      municipalValue: orNull(obj({ low: num, high: num, basis: en('cape_town_rates_bill') })),
      pricePerM2Floor: nnum, pricePerM2Erf: nnum, floorToErfRatioPercent: nnum,
    }),
    ownership: obj({ costBeforePrincipalMonthly: num, principalRepaidFirstMonth: num, breakEven: obj({ requiredPriceRisePercent: num, yearsByAnnualGrowth: arr(obj({ annualGrowthPercent: num, years: num })) }), rental: orNull(obj({ expectedMonthlyRent: num, grossYieldPercent: num, netYieldPercent: num, monthlyCashFlow: num })) }),
    risks: arr(obj({ code: str, severity: en('high', 'medium', 'low'), message: str })),
    offerPlan: obj({ beforeOffering: arr(str), suggestedConditions: arr(str) }),
    questionsForAgent: arr(str),
    evidence: arr(obj({ field: str, value: nnum, source: en('listing', 'listing_ai_extracted', 'supplied', 'not_stated') })),
    disclaimer: str,
  }),
};

export const openapi = {
  openapi: '3.1.0',
  info: { title: 'EiX Property Decision API', version: '1.0.0', description: 'Buyer decision layer: true cost of ownership, affordability, rate stress test, price evidence, risks and an offer plan. Stateless: nothing is stored.' },
  servers: [{ url: '/' }],
  security: [{ bearer: [] }],
  paths: {
    '/v1/decisions': { post: {
      operationId: 'createDecision', summary: 'Create a buyer decision',
      parameters: [{ name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string', maxLength: 128 }, description: 'Replays the same response for 24 hours. Reusing a key with a different body returns 422.' }],
      requestBody: { required: true, content: { 'application/json': { schema: ref('DecisionRequest') } } },
      responses: { '200': { description: 'Decision', content: { 'application/json': { schema: ref('DecisionV1') } } }, '400': problem('Invalid JSON'), '401': problem('Missing or invalid API key'), '413': problem('Body too large'), '415': problem('Content-Type must be application/json'), '422': problem('Validation, extraction or data problem. See "code" and "errors".'), '429': problem('Rate limited or renderer busy. See Retry-After.'), '500': problem('Unexpected error. Quote requestId.') },
    } },
    '/v1/comparables/extract': { post: {
      operationId: 'extractComparables', summary: 'Turn public listing pages into comparables',
      description: 'Listing pages carry asking prices and rents, so results are labelled priceType "asking". Feed them into /v1/decisions as comparables and rentalComparables.',
      requestBody: { required: true, content: { 'application/json': { schema: ref('ExtractRequest') } } },
      responses: { '200': { description: 'Extracted comparables', content: { 'application/json': { schema: ref('ExtractResponse') } } }, '401': problem('Missing or invalid API key'), '422': problem('Validation failed'), '429': problem('Rate limited or renderer busy') },
    } },
    '/v1/health': { get: { operationId: 'health', security: [], summary: 'Liveness', responses: { '200': { description: 'OK' } } } },
    '/v1/openapi.json': { get: { operationId: 'spec', security: [], summary: 'This document', responses: { '200': { description: 'OpenAPI 3.1 document' } } } },
  },
  components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } }, schemas },
};
