# EiX Property Decision API: feature inventory for verification

Status tags: **[T]** covered by an automated test (`npm test`, 132 scenarios) · **[S]** rule or fact checked against a source in research · **[H]** my default or heuristic, tunable, not validated against real outcomes · **[U]** not tested live or not built.
The JSON API is the full product. The standalone HTML report (`npm run analyze`) is an earlier subset (see section 13).

## 1. Inputs
| Feature | Detail | Tag |
|---|---|---|
| Structured facts | `property`: askingPrice (R50k to R200m) plus bedrooms, bathrooms, parking, floorAreaM2, erfM2, ratesMonthly, levyMonthly, propertyType, titleType, suburb, city, title, features | T |
| Listing URL | `url` (optionally with `html` you already hold). Rendered with Playwright, then parsed | T for html path; U for live pages |
| Buyer | profile (first_time, investor, upgrader), depositPercent (default 10), interestRate (default 10.5), termYears (default 20), grossMonthlyIncome, expectedMonthlyRent, vatSale | T |
| Comparable sales | up to 50: price, floorAreaM2, erfM2, soldDate, address | T |
| Rental comparables | up to 50: monthlyRent, floorAreaM2, address | T |
| Market data | `marketData: "provider"` pulls sales and rentals from your licensed feed (HTTP contract in the README). Comparables also carry bedrooms, propertyType, priceType (sold or asking) and dates | T with a mock provider |
| Neighbourhood | opt-in: location, priorities (preset or 0-5 weights), metrics, osm flag | T |
| Strict validation | unknown fields rejected, ranges checked, errors name the field | T |

## 2. Extraction (url/html source)
- JSON-LD first (price, beds, baths, floor size, suburb), then text patterns. Reads both "Beds 3 Bathroom 2 parking 1" and "3 Bedroom" layouts. [T on 4 saved real listings: 3 MG property pages, 1 Chas Everitt]
- Fields: price, bedrooms, bathrooms (incl. 1.5), parking, floor size, erf/land size, levy, rates, suburb, city, property type, title type (sectional inferred from levy, apartment type or "sectional title/body corporate"; freehold from "freehold/freestanding"), 19 feature keywords, listing coordinates (kept only inside South Africa). [T]
- Levy or rates under R50 treated as not stated (agents type "R 1"). [T]
- City from URL or text after "for sale in" (separates Observatory Cape Town from Observatory Johannesburg). [T]
- Missing values stay null and are never guessed. Optional Claude fallback fills only fields the page states. [U for the fallback]
- Bot-block page detection, price sanity check, clear "supply the HTML instead" errors. [T]
- Rental listings ("R 15 000 Per Month", "to rent") are recognised and never read as a sale price. Both "Beds 3 Bathroom 2" and "3 Bedrooms 3.5 Bathrooms" layouts are handled. [T on 12 real listings saved as text: Property24-network pages, Chas Everitt, Greeff, Leapfrog; 2 are rentals]
- "Estate" in the suburb name marks a homeowners-association estate. [T]
- Not built: Facebook listings, address-only lookup. [U]

## 3. Costs (`costs`, `assumptions`)
- Monthly bond (standard amortisation): R3.15m at 10.5% over 20 years = R31,448.97. [T]
- Rates, levy, upkeep reserve (1% of value a year [H]), monthly total. Unknown rates or levy come back as null and are listed in `monthlyExcludes`, never as R0. [T]
- Transfer duty from the SARS table (0% to R1.21m; 3%; 6%; 8%; 11%; 13% above R13.31m), unchanged for 2026/27; R0 for a VAT sale. R3.5m = R162,356. [T, S]
- Legal and bond fees estimated at a flat 3% of price [H]; likely too high at very high prices (it is not tiered). Cash to close = deposit + duty + fees (R3.5m at 10% = R617,356). [T]
- Income required: bond ÷ 30% [H], and the same if rates rise 2 points. Bond-to-income percent when income given. [T]
- Stress test grid: deposits 0/10/20% × rates -1/0/+1/+2 points. [T]
- Default rate is prime 10.5% after the SARB's 23 July 2026 decision; update manually. [S, U for September]

## 4. Price evidence (`priceEvidence`)
- Comparable benchmark needs 3+ genuinely similar comparables. Each is weighted by: same property type (others get zero weight and are excluded), floor-area similarity (zero at ±40%; erf size is used when floor size is unknown), bedrooms (one apart halves the weight), age (full weight to 6 months, fading to zero at 36; undated ×0.7) and asking versus sold (asking ×0.7). Values are scaled to the subject's floor area when both sizes are known. True outliers (beyond 3 robust deviations and over 10% from the median) are dropped. [T, H]
- Output: weighted median benchmark, gap %, position (above / in line / below at ±7% [H]), evidence strength, effective sample size, weighted and raw dispersion, interquartile range, excluded and outlier counts, share of weight from asking prices, and a discussion range (95%-100% of the benchmark, or the lower quartile if lower) when above. [T]
- Strength: strong (effective sample 5+, spread 15% or less, raw spread 25% or less), moderate, weak (effective sample under 3, spread over 30%, or raw spread over 45%). Weak, or fewer than 3 similar comparables, gives no benchmark and a NO_COMPARABLES risk that says why. [T, H]
- Real-data check: ten public Observatory asking prices (2024-25) came back "weak" (their middle half spans 44% of the median). A plain median would have called R3.5m in line with R3.3m. [T]
- Cape Town municipal-value bracket from the rates bill, using three published tariff sets (0.007159 with R450k exempt; 0.007010 with R605k; 0.006428 with R620k). 2026/27 sources conflict, so it is a range. [T, S]
- R/m² of floor and erf, floor-to-erf ratio. [T]

## 5. Ownership and rental (`ownership`, `scorecard.rental`)
- Cost of owning before principal, principal repaid in month one. [T]
- Break-even: price rise needed to recover buying costs plus 6% selling costs [H]; years at 3%, 6% and 9% growth. [T]
- Rent: supplied, or estimated from 3+ genuinely similar rentals using the same similarity-weighted engine as sales (too thin or too spread out gives WEAK_RENTAL_EVIDENCE and no estimate). Gross yield, net yield (5% vacancy, rates, levy, 1% upkeep [H]), monthly cash flow, whether rent covers costs. [T]

## 6. Risks (`risks`: 22 stable codes)
FLOOR_AREA_MISSING · TITLE_TYPE_UNKNOWN · LEVY_NOT_STATED (also fires for estates) · HIGH_SITE_COVERAGE (over 80%) · POSSIBLE_UNAPPROVED_ADDITIONS (bathrooms ≥ bedrooms, not sectional) · NO_BACKUP_POWER_OR_WATER · LOW_DEPOSIT (under 10%) · HIGH_BOND_TO_INCOME (over 30%) · NO_COMPARABLES (no usable benchmark; the text says why) · ABOVE_MUNICIPAL_VALUE (over 5% above the bracket) · OLDER_PROPERTY (period keywords) · WEAK_RENTAL_EVIDENCE · AREA_SAFETY_CONCERN · AREA_PRICES_FALLING · FLOOR_EXCEEDS_ERF (floor area over the erf: multi-storey or a data error; replaces the coverage warning above 100%) · MULTI_UNIT_CONVERSION · SHORT_TERM_LETTING_IN_USE · TENANT_IN_OCCUPATION · INCOME_CLAIM_UNVERIFIED · INCOME_BELOW_BOND · LISTING_UNDER_OFFER · LONG_TIME_ON_MARKET (over 120 days, not under offer). Severity high/medium/low. Triggers are [H]; codes are [T].

## 7. Scorecard (`scorecard`)
- **Confidence 0-100** (evidence in hand): asking price 10, physical facts 20, rates 5, levy and title 10, price evidence 30 (strong) / 20 (moderate) / 8 (municipal only) reduced by up to 25% when comparables are asking prices, rental evidence 15 (comparables) / 8 (supplied), buyer income 10. Bands Low/Moderate/High. [T, H]
- **Investment score 0-100**: weighted average of only the components the evidence supports: price position (30, or 12 if municipal-only), rental return (30 investor / 10 other), affordability (15 / 30), rental cash flow (when no income), running costs (8), property risks (12). Capped at price score + 30 when a benchmark exists. Withheld (null) below 30% confidence. `provisional` when confidence is under 60% or there is no comparables benchmark. Bands Strong/Good/Fair/Weak/Poor. [T, H]
- **Risk score 0-100** (higher is riskier): a base of 10 and each flag (high 22, medium 10, low 3) are combined as independent chances with diminishing returns, so stacked flags cannot saturate the score; +10 if a 2-point rate rise pushes the bond over 40% of income. Null below 30% confidence. [T, H]
- **Decision label**: BUY needs a comparables benchmark, confidence 70+, score 75+, risk 35 or less, bond within 30% of income, price within 7% of benchmark (investors also 6%+ net yield). WALK AWAY needs confidence 60+ and (price over 20% above a strong benchmark, or bond over 45% of income, or score under 35). NEGOTIATE when price is over 7% above the benchmark. Otherwise PROCEED WITH CAUTION. Includes reasons and a next step. [T, H]
- **Configurable and versioned:** every weight and threshold is in `src/scoring.ts`; override any subset with a JSON file via `SCORING_CONFIG`. The version is returned as `scorecard.scoringVersion`. [T]
- **Note:** the response has two verdict fields: `verdict.code` (evidence state) and `scorecard.decision.label` (your four labels). Display `scorecard.decision`.

## 8. Neighbourhood DNA (`neighbourhood`, opt-in)
- Nine dimensions, 0-100 with evidence text and source. From OpenStreetMap: walkability, public transport, schools nearby (access, not quality), lifestyle and dining, green space, healthcare. Supplied by you: safety (crime per 100k vs a benchmark), price momentum (5-year growth), buyer demand (median days on market). [T with a fixed fixture; U against live OpenStreetMap]
- Presets balanced, family, young_professional, retiree, investor, or custom weights. Fit %, coverage, provisional flag, strengths, trade-offs. [T]
- Archetype label (for example "Walkable urban village"). [T, H]
- Poor safety or falling prices add risks and lift the risk score; fit added to verdict reasons. [T]
- Fails soft when OpenStreetMap is down or coordinates are missing (status partial, no invented scores). OSM attribution returned. 24-hour cache. [T]
- Scoring thresholds are my defaults. [H]

## 9. Buyer document pack (`documents`, up to 18 items)
Each item has priority, stage (before offer / with offer / before signing / during transfer), who gets it, cost type, why, how, link or null, the report risks it settles, and `basis`.
- Cape Town, checked against City pages: valuation roll (free, GV2025 from 1 July 2026), City Map and Zoning Viewer (free; zoning, overlays, heritage status), building plans (owner or authorised person only, small fee). [S]
- Checked against practitioner sources: rates clearance certificate (section 118, 60 days, conveyancer applies), body corporate pack, levy clearance certificate. [S]
- Estates: a homeowners association pack and association levy clearance replace the body corporate pack; standard practice, not checked against a source. [T]
- Standard practice, not checked against a municipal page: rates account, comparable sales, bond pre-approval, compliance certificates, inspection, title deed search, and all non-Cape Town entries (generic, no links). [H]
- Adapts to title type, older property, missing comparables. The API does not fetch documents. [T]

## 10. Offer plan and agent questions
Three "before you offer" steps, five suggested offer conditions, and 6-7 tailored agent questions. [T for presence]

## 11. Evidence audit
Eight facts each tagged `listing`, `supplied`, `listing_ai_extracted` or `not_stated`, plus the assumptions used (rate and date, deposit, term, fees, upkeep, income rule, selling costs, vacancy, duty basis). [T]

## 12. API platform
- Routes: `POST /v1/decisions`, `POST /v1/comparables/extract`, `GET /v1/health`, `GET /v1/openapi.json`. [T]
- Bearer keys (stored hashed), per-client rate limit with RateLimit headers and Retry-After, idempotency keys (24 hours, in memory), request ids, JSON logs, 2 MB limit, CORS allowlist, SIGTERM drain. [T except CORS and logs]
- Errors as problem+json with codes UNAUTHORIZED, RATE_LIMITED, VALIDATION_FAILED, INVALID_JSON, UNSUPPORTED_MEDIA_TYPE, BODY_TOO_LARGE, URL_NOT_ALLOWED, INSUFFICIENT_DATA, ANALYSIS_FAILED, IDEMPOTENCY_KEY_REUSED, BUSY, NOT_FOUND, METHOD_NOT_ALLOWED, INTERNAL_ERROR. [T for most]
- Host allowlist and redirect re-check, 2 concurrent browser renders. [T for allowlist; U for redirect and renders]
- OpenAPI 3.1 spec; every test response is validated against it. [T]
- Dockerfile and CI workflow. [U: image not built, CI not run]

## 13. Standalone HTML report (`npm run analyze`)
Costs, stress test, price check, buy-or-rent and break-even, watch-outs, offer conditions, agent questions and a facts table. It does not include the scorecard, neighbourhood or documents. Flags: --profile --deposit --rate --term --income --rent --vat --city --comps --price --floor --erf --levy --rates --html. [T for the engine; U for live URLs]

## 14. Not included (check these are acceptable)
- No built-in sales or rental data. Comparables must come from your feed (`marketData: "provider"`) or from public listings, which give asking prices only.
- Scoring weights and thresholds are unvalidated defaults. The consistency tests prove sensible behaviour (monotonic, continuous, deterministic); they do not prove accuracy. The calibration harness is ready but there are no real outcomes yet.
- Not tested live: Property24.com and PrivateProperty.co.za pages directly (tested on Property24-network pages, Chas Everitt, Greeff and Leapfrog as saved text, not raw HTML or Playwright), live OpenStreetMap, the live Nominatim service, the Docker build, a deployment. `npm run smoke` and the nightly workflow are provided to run from a machine with internet.
- The legal and bond fee estimate is a flat 3%, not tiered by price.
- No school quality, load-shedding, water, noise or condition data; no photo analysis.
- Idempotency and rate limits are in memory (single instance). Nothing is stored; there is no GET by id.
- No PDF or HTML output from the API, no payments, webhooks or accounts.
- Municipal-value cross-check and direct links are Cape Town only.
- Prime rate, transfer duty table and Cape Town tariffs are updated by hand.

## 15. Market evidence, display rules and validation tooling
- **Market data provider:** set `COMPS_PROVIDER_URL` (and `COMPS_PROVIDER_KEY`); with `marketData: "provider"` the API posts the subject (city, suburb, type, bedrooms, sizes, coordinates) and expects `{sales, rentals}` back. Unusable rows are dropped, failures fail soft, and the response reports `marketData.status`. [T with a mock provider]
- **Listing-to-comparables:** `POST /v1/comparables/extract` turns up to 20 public listing pages into sale (asking) and rental comparables you can feed back in; allowlisted hosts only. Check each portal's terms. [T]
- **Display rules:** `displayGuidance` says show, show_as_provisional or hide for the score, label, price verdict, rent, yield and neighbourhood fit, plus notices the report must display, so a figure never appears without the evidence behind it. [T]
- **Consistency checks:** the score never rises as price rises, the label never improves, no cliffs (8 points per R100k step), more income never hurts, more evidence never lowers confidence, deterministic and bounded. A deliberate mutation of the price logic made them fail. [T]
- **Calibration harness:** `npm run calibrate -- cases.jsonl` compares labels and scores with sale prices, realised returns and expert labels (Spearman, confusion matrix, discount by label, sample-size warnings). [T on its arithmetic]
- **Live checks:** `npm run smoke -- smoke/urls.txt --osm lat,lng` and `.github/workflows/live-checks.yml` (nightly) report field coverage per portal and OpenStreetMap health. [U: needs a networked machine]

## 16. Live listing capture and investigation (`listing`, `incomeTest`)
Tested on the live Property24 page for 42 Queens Rd, Woodstock (fetched 2026-09-20 by the research tool, combined with the sections a browser renders). Not yet run through Playwright against the live site.
- **Captured (`listing`):** listing number, status (under offer or listed), listing date and days on market, street address, agency and agent, reception rooms, parking, features, every point of interest with its distance, the portal's bond calculator figures, the addresses in "Recent sales", and the source URL. [T]
- **Portal cross-check:** the portal's repayment, once-off costs and minimum income are captured and reconciled: implied interest rate (10.5% with no deposit), income rule (30%) and implied fees and bond costs (R159,444 against our flat 3% estimate of R142,500). [T]
- **Listing text read like an investigator (`listing.signals`, `listing.claims`):** units, short-term letting and how many units, tenants, stated income and yield, period building, condition warnings, seller urgency, second dwellings, development claims, defects. Only short evidence phrases are returned, never the marketing copy. Menus cannot trigger it (a test covers "House to Rent in Woodstock" and "Tenant Screenings"). [T, H]
- **Income test (`incomeTest`):** checks a claimed income against the bond, break-even income, per-unit and nightly-rate requirements, gross and net yield on the claim. It never feeds the score; only buyer-supplied evidence does. [T]
- **New risks and documents:** multi-unit conversion, short-term letting, tenants, unverified or insufficient income, under offer, heritage permit history (Heritage Western Cape agendas), lease agreements, and short-term letting evidence. Cape Town rules cited are: no mandatory citywide registration yet, a draft Short-Term Letting By-Law announced in February 2026, Consent Use possibly needed for accommodation use, and a proposed commercial rating for properties let short-term over half the year from 1 July 2027 (proposed, not confirmed). [S, checked against news and practitioner sources, not the by-law text]
- **Known limit:** Property24 shows sold prices and dates as protected images, so achieved prices are not captured. `listing.recentSales.pricesAvailable` is false and the note names licensed sources. Capturing them by image recognition would defeat a protection and is not built.
- **Known limit:** points of interest show only the nearest few per category, so they are reported but not scored.

## 17. Neighbourhood DNA evidence tiles and capture diagnostics
- **Six tiles, always present in `neighbourhood.areas`:** Transport, Schools / healthcare, Lifestyle / retail, Safety indicators, Parks / recreation, Market momentum, plus `place` (suburb, city, province) and the stated principle: evidence only, no score manufactured from missing data. Each tile has `status` (evidence_found or no_evidence), a `reason`, a plain-language `summary`, the `items` behind it with distances, the `source` and a `score` only where a scored dimension exists. [T]
- **Evidence comes from the listing's own nearby places** (nearest few per category, reported as evidence and not scored), **OpenStreetMap** when coordinates exist, and **your supplied metrics** for safety and market momentum. Items under "Transport and Public Services" that are not transport (recycling bins) are ignored. [T]
- **An empty tile says why:** `evidence`, `none_found` (the map ran and mapped nothing within 1.5 km, coverage varies), `not_retrieved` (map unavailable, no coordinates, or the listing's own sections were not captured) or `not_requested`. `neighbourhood.mapStatus` gives the map lookup state. "No supporting evidence found" is therefore never used for "not checked". [T]
- **An empty map answer is treated as a data gap and is never scored as zero.** [T]
- **Capture diagnostics (`listing.capture`):** whether the page was rendered in a browser or supplied as HTML, which sections were captured (details, points of interest, bond calculator, recent sales), and a warning when the JavaScript-loaded sections are missing. Property24 adds those three sections with JavaScript after the page loads, so a static fetch cannot see them. [T]
- **The renderer now scrolls the page and waits for those sections.** [U: this logic has not been run in a real browser here; `npm run smoke` warns when a Property24 page yields none of them.]
- **Also:** OpenStreetMap police and fire stations feed the Safety tile (never scored); "fibre-ready" is no longer reported as fibre and raises a FIBRE_READY signal; province is derived from the URL or city and never guessed. [T]

## 18. Address geocoding (`neighbourhood.location`, `neighbourhood.geocoding`)
- **When it runs:** the neighbourhood layer is requested, no coordinates were supplied or found on the listing, and there is a street address or suburb to search. Supplied coordinates always win and are never geocoded. Switch off per request with `neighbourhood.geocode: false` or globally with `GEOCODER=off`. `property.address` lets structured requests be geocoded too. [T]
- **How:** Nominatim (OpenStreetMap) by default, or any geocoder behind the same interface. Tries the full address, then the street without its number, then the suburb centre. [T]
- **Safeguards:** a result is accepted only if it is inside South Africa and names the expected suburb and city, so a same-named street in another city is rejected; policy-compliant requests (identifying User-Agent, at most one a second, results cached 30 days, misses 1 hour); 8-second timeout; failures never break the decision. [T against a mock Nominatim]
- **Honest precision:** `precision` is `address`, `street`, `suburb` or `supplied`. A street anchor cuts the neighbourhood confidence by 15% and a suburb-centre anchor by 40%, and the dimension evidence says the distances are approximate. `matchedAs` records what the geocoder matched. `geocoding.status` is ok, not_found, mismatch, unavailable, disabled or not_needed, so a tile can say why it is empty. [T]
- **Attribution:** the Nominatim attribution is added to `neighbourhood.attribution`. [T]
- **Limits:** the public Nominatim server is for light use only; set `NOMINATIM_URL` to your own instance or a paid geocoder for production, and set `GEOCODER_USER_AGENT` to identify your service with a contact address. Not tested against the live service from here (network blocked); a suburb-centre anchor is a weak proxy for the property's own surroundings. [U]
