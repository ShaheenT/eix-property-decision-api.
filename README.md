# EiX Property Decision API

Decision layer for buyer reports. Send property facts (or a listing URL) plus any comparables, get a structured decision: scorecard (investment score, risk score, confidence, rental return, BUY/CAUTION/NEGOTIATE/WALK AWAY), true monthly and upfront cost, affordability, rate stress test, price evidence, break-even, risks, offer plan, agent questions and an evidence audit. Stateless (nothing stored). Contract: `GET /v1/openapi.json`. Worked example: `examples/`.

## Call it
```bash
curl -s https://YOUR_HOST/v1/decisions \
  -H "Authorization: Bearer $EIX_KEY" -H "Content-Type: application/json" -H "Idempotency-Key: $(uuidgen)" \
  -d '{"property":{"askingPrice":3500000,"bedrooms":3,"bathrooms":3,"parking":2,"erfM2":200,"ratesMonthly":1318,"city":"Cape Town"},
       "buyer":{"profile":"first_time","grossMonthlyIncome":120000},
       "comparables":[{"price":3050000,"floorAreaM2":130,"soldDate":"2026-06-14"}]}'
```
Use `property` when you already hold the facts (fast, deterministic, no browser). Use `url` (optionally with `html` you fetched) to have the API extract them. Call it server-side from your report route and render `verdict`, `costs`, `priceEvidence`, `risks`, `offerPlan` and `evidence`. Do not put the key in browser code.

| Response field | Use in the report |
|---|---|
| `scorecard.decision` | Your four labels: `BUY`, `PROCEED WITH CAUTION`, `NEGOTIATE`, `WALK AWAY`, with `reasons[]` and `nextStep` |
| `scorecard.investmentScore` | 0-100 (null when evidence is too thin), band, `provisional` flag, and the weighted `components[]` behind it |
| `scorecard.riskScore` | 0-100 (higher is riskier), band, `drivers[]` |
| `scorecard.confidence` | 0-100 evidence coverage with a per-area breakdown: your Confidence Meter |
| `scorecard.rental` | Estimated rent with range, gross and net yield, monthly cash flow (needs `rentalComparables` or `buyer.expectedMonthlyRent`) |
| `costs`, `stressTest`, `ownership` | Cash to close, monthly cost, rate risk, break-even |
| `priceEvidence` | Comparable benchmark (3+ `comparables`), Cape Town municipal-value bracket, R/m² |
| `risks[].code`, `evidence[].source` | Stable risk codes; `listing`, `supplied`, `listing_ai_extracted`, `not_stated` |

## How the scorecard is decided
- **Confidence** = evidence in hand: asking price 10, physical facts 20, rates 5, levy and title 10, price evidence 30 (6+ sales) or 20 (3-5) or 8 (municipal only), rental evidence 15 (3+ rentals) or 8 (rent supplied), buyer income 10.
- **Investment score** = weighted average of price position, rental return, affordability, running costs and property risks, using only components the evidence supports. A price more than about 15% above strong comparables caps the score. Below 30% confidence no score is issued.
- **BUY** needs confidence 70+, score 75+, risk 35 or below, price within 7% of the benchmark, bond at 30% of income or less (and net yield 6%+ for investors). **WALK AWAY** needs confidence 60+ and a price over 20% above 6+ comparable sales, a bond over 45% of income, or a score under 35. **NEGOTIATE**: price over 7% above the benchmark. Everything else is **PROCEED WITH CAUTION**.
- Rental figures allow 5% vacancy, 1% upkeep, rates and levy. Weights and thresholds live in `src/scorecard.ts`; tune them against real outcomes.

**The scorecard is only as good as the evidence supplied.** Without sales and rental comparables the API returns a low-confidence, provisional result and says what is missing. Sales comparables (Lightstone, Windeed, agent data) and rental comparables must come from your data feed. `examples/full-evidence-*` uses illustrative numbers, not market data.

Every key is always present; unknown values are `null`. Additive changes keep `schemaVersion` 1.0; breaking changes ship as `/v2`.

## Neighbourhood DNA (opt-in: add a `neighbourhood` object)
Shows what is around the property and how well it fits what *this* buyer wants, not just the house.
- **Where:** coordinates come from the listing page (`url` source) or `neighbourhood.location`. Only points inside South Africa are accepted.
- **Nine dimensions, each 0-100 with its evidence and source:** walkability, public transport, schools nearby, lifestyle and dining, green space, healthcare access (all from OpenStreetMap), plus safety, price momentum and buyer demand from `neighbourhood.metrics` (`crimePer100k` with `benchmarkCrimePer100k`, `priceGrowth5yPercent`, `medianDaysOnMarket`) that you supply.
- **Buyer fit:** `priorities` is a preset (`balanced`, `family`, `young_professional`, `retiree`, `investor`) or your own 0-5 weights per dimension. The same street scores differently for different buyers, with `strengths`, `tradeoffs` and a `provisional` flag when priorities have no data.
- **Archetype** (for example "Walkable urban village") from the mapped amenities.
- **Feeds the decision:** a poor safety score or falling prices add `AREA_SAFETY_CONCERN` / `AREA_PRICES_FALLING` to `risks` and the risk score, and the fit is added to the verdict reasons.
- **Limits, stated in the response:** OpenStreetMap shows what is mapped, so sparse areas score as a minimum. "Schools nearby" measures access, not school quality. The public Overpass endpoint is rate limited (set `OVERPASS_URL` to a self-hosted or paid one) and OSM data requires the attribution returned in `attribution`. Thresholds are tunable heuristics in `src/neighbourhood.ts`. If OpenStreetMap is down the layer returns `partial` and never invents scores.

## Buyer document pack (always returned as `documents`)
A prioritised, ordered list of the paperwork that helps this buyer decide and complete the purchase: what it is, why it matters, who gets it, what it costs, how to get it, a direct link where one is verified, and which of the report's own risks it settles (`resolvesRisks`). It adapts to freehold or sectional title, older or heritage-type properties, missing comparables and the municipality.
- **Free and checked (Cape Town):** the valuation roll (GV2025 applies from 1 July 2026; searchable by erf number, address or sectional title details, with a rates estimate) and the City Map and Zoning Viewer, which also shows heritage status. Both are free online.
- **Not free or not self-serve:** approved building plans are released only to the registered owner or an authorised architect or draughtsperson, for a small City search fee, so the pack tells the buyer to have the seller obtain them. The rates clearance certificate (section 118 of the Municipal Systems Act) is applied for by the seller's conveyancer, is valid for 60 days and is part of transfer costs. A sectional title also needs the body corporate pack and a levy clearance certificate.
- **Standard practice, not checked against a municipal page:** compliance certificates, inspection, pre-approval, title deed search and all non-Cape Town entries. Each item carries `basis` (`verified_source` or `standard_practice`) and the pack carries `lastVerified`.
- **The API does not fetch these documents.** Most are released only to the owner, the seller's attorney or through an interactive municipal search, so it tells the buyer exactly what to get and how. Direct municipal links exist for Cape Town only; other municipalities get generic guidance and no invented links. Re-check fees and procedures periodically (`DOCS_VERIFIED` in `src/documents.ts`).

## Market evidence, display rules and validation
- **Comparables engine:** benchmark from 3+ genuinely similar comparables (type, size, bedrooms, age; asking prices count less than sold). Spread-out pools are refused rather than averaged: ten real public Observatory asking prices came back too spread out to benchmark. Rentals use the same engine.
- **Your data feed:** set `COMPS_PROVIDER_URL`/`COMPS_PROVIDER_KEY` and send `"marketData": "provider"`. Contract: POST the subject `{city, suburb, propertyType, bedrooms, floorAreaM2, erfM2, lat, lng}`; return `{"sales":[{"price","priceType":"sold"|"asking","floorAreaM2","erfM2","bedrooms","propertyType","soldDate"}],"rentals":[{"monthlyRent","floorAreaM2","bedrooms","propertyType","listedDate"}]}`. Failures fail soft.
- **Public listings as comparables:** `POST /v1/comparables/extract` with `{"items":[{"url","html"?}]}` returns asking-price `sales` and `rentals` to feed back in.
- **Display rules:** obey `displayGuidance` (show / show_as_provisional / hide, plus `requiredNotices`). The score is provisional whenever the price is not checked against comparables.
- **Scoring config:** weights and thresholds live in `src/scoring.ts`; override with a JSON file via `SCORING_CONFIG`. Every response carries `scorecard.scoringVersion`.
- **Validation:** `npm test` includes consistency checks (monotonic, continuous, deterministic). They prove sensible behaviour, not real-world accuracy. To validate against reality, log closed cases and run `npm run calibrate -- cases.jsonl` (see `calibration/format-example.jsonl`); aim for 100+ cases with sale prices and 30+ expert labels.
- **Live checks:** `npm run smoke -- smoke/urls.txt --osm -33.9366,18.4713` from a machine with internet; `.github/workflows/live-checks.yml` runs it nightly to catch portal layout drift.

## Live listing capture
Send a listing `url` (the API renders it) or the `html` you fetched. The response adds `listing` (everything captured: number, status, dates, address, agency, features, points of interest, the portal's own calculator figures reconciled against ours, recent-sales addresses, and investigator `signals` and `claims`) and `incomeTest` (a claimed income tested against the bond and break-even). Marketing income claims are analysed and never enter the score. Sold prices on Property24 are protected images and are not captured; use licensed deeds data for achieved prices. Check each portal's terms before automating.

## Errors (RFC 9457 problem+json, always with `code` and `requestId`)
`400 INVALID_JSON` · `401 UNAUTHORIZED` · `413 BODY_TOO_LARGE` · `415 UNSUPPORTED_MEDIA_TYPE` · `422 VALIDATION_FAILED (errors[])`, `URL_NOT_ALLOWED`, `INSUFFICIENT_DATA`, `ANALYSIS_FAILED`, `IDEMPOTENCY_KEY_REUSED` · `429 RATE_LIMITED | BUSY (Retry-After)` · `500 INTERNAL_ERROR`. Unknown request fields are rejected.

## Run
```bash
npm install && npx playwright install chromium   # browser only needed for the url source
cp .env.example .env && npm test                  # 100 scenarios, incl. OpenAPI conformance
npm start
docker build -t eix-api . && docker run --init --ipc=host -p 8080:8080 --env-file .env eix-api
```
Ops: bearer keys stored as hashes, per-client rate limits with `RateLimit-*` headers, request ids, JSON access logs, 2 MB body cap, SSRF host allowlist with redirect re-check, no-store responses, SIGTERM drain. `npm run analyze` still renders a standalone HTML report.

## Before you go live
- Idempotency and rate-limit state are in memory: one instance only, or move both to Redis.
- No comparable-sales feed. Price fairness needs `comparables` from Lightstone, Windeed or an agent.
- Update `DEFAULT_RATE`/`RATE_AS_OF` after each SARB meeting, the transfer duty table each 1 April, and the Cape Town rates tariffs (2026/27 sources conflict).
- The `url` source was tested on saved text of four public listings, not live Property24 or PrivateProperty HTML, and the Docker image was not built here. Confirm each portal's terms allow automated access.
- Put it behind TLS (your platform or a reverse proxy).

*Decision support only. Not a valuation or financial, tax or legal advice.*
