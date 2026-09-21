Feature: Decision API contract

  Scenario: Health and spec are public, and request ids are echoed
    Given the header "x-request-id" is "req-123"
    When I GET "/v1/health" with key "-"
    Then the status is 200
    And the response header "x-request-id" is "req-123"
    When I GET "/v1/openapi.json" with key "-"
    Then the JSON at "openapi" is "3.1.0"

  Scenario Outline: Bad credentials are rejected
    When I POST "/v1/decisions" with key "<key>":
      """
      {"property":{"askingPrice":3500000}}
      """
    Then the status is 401
    And the JSON at "code" is "UNAUTHORIZED"
    And the response header "www-authenticate" is "Bearer"

    Examples:
      | key      |
      | -        |
      | sk_wrong |

  Scenario: Validation names the offending field
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"bedrooms":3},"extra":1}
      """
    Then the status is 422
    And the JSON at "code" is "VALIDATION_FAILED"
    And the JSON at "errors.0.field" is "extra"
    And the JSON at "errors.1.field" is "property.askingPrice"

  Scenario: Exactly one source is required
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000},"url":"https://www.property24.com/x"}
      """
    Then the status is 422
    And the JSON at "errors.0.field" is "body"

  Scenario: Wrong content type
    Given the header "content-type" is "text/plain"
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000}}
      """
    Then the status is 415

  Scenario: Structured facts give a full, contract-valid decision
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000,"bedrooms":3,"bathrooms":3,"parking":2,"erfM2":200,"ratesMonthly":1318,"city":"Cape Town","propertyType":"house"}}
      """
    Then the status is 200
    And the response matches the OpenAPI schema
    And the JSON at "verdict.code" is "GATHER_EVIDENCE"
    And the JSON at "costs.monthly.bond" is "31448.97"
    And the JSON at "costs.upfront.transferDuty" is "162356"
    And the JSON at "costs.upfront.total" is "617356"
    And the JSON at "priceEvidence.municipalValue.low" is not null
    And the JSON at "priceEvidence.comparables" is null
    And the JSON at "evidence.4.source" is "not_stated"

  Scenario: Comparables, income and rent unlock the price verdict
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000,"erfM2":200,"ratesMonthly":1318,"city":"Cape Town"},
       "buyer":{"profile":"first_time","grossMonthlyIncome":150000,"expectedMonthlyRent":25000},
       "comparables":[{"price":2900000},{"price":3000000},{"price":3100000},{"price":3200000,"soldDate":"2026-06-01"}]}
      """
    Then the status is 200
    And the response matches the OpenAPI schema
    And the JSON at "verdict.code" is "NEGOTIATE"
    And the JSON at "priceEvidence.comparables.position" is "above"
    And the JSON at "ownership.rental" is not null

  Scenario: Stretched affordability takes priority
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000},"buyer":{"grossMonthlyIncome":60000}}
      """
    Then the JSON at "verdict.code" is "AFFORDABILITY_STRETCH"

  Scenario: A URL with supplied HTML is extracted without a browser
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"url":"https://property.mg.co.za/x","html":"<html><body>R 2 950 000 3 Bedroom House for Sale in Observatory Cape Town, Observatory Beds 3 Bathroom 2 parking 1 Floor Size 117 m² Erf Size 270 m² Rates and Taxes R 1 990</body></html>"}
      """
    Then the status is 200
    And the response matches the OpenAPI schema
    And the JSON at "property.city" is "Cape Town"
    And the JSON at "evidence.4.value" is "117"
    And the JSON at "evidence.4.source" is "listing"

  Scenario: Unsupported hosts are refused
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"url":"http://localhost:9/x"}
      """
    Then the status is 422
    And the JSON at "code" is "URL_NOT_ALLOWED"

  Scenario: Unusable input is a 422, not a 500
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"url":"https://www.property24.com/x","html":"<html><body>3 Bedroom House</body></html>"}
      """
    Then the status is 422
    And the JSON at "code" is "INSUFFICIENT_DATA"

  Scenario: Idempotent retries replay the same decision
    Given the header "Idempotency-Key" is "retry-1"
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3100000}}
      """
    And I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3100000}}
      """
    Then the response header "idempotent-replay" is "true"
    And the JSON at "id" equals the previous response
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3200000}}
      """
    Then the status is 422
    And the JSON at "code" is "IDEMPOTENCY_KEY_REUSED"

  Scenario: Per-client rate limits return Retry-After
    When I POST "/v1/decisions" with key "sk_limited" 3 times:
      """
      {"property":{"askingPrice":3100000}}
      """
    Then the status is 429
    And the JSON at "code" is "RATE_LIMITED"
    And the response header "retry-after" is present

  Scenario: Unknown paths are problem+json
    When I GET "/v1/nothing" with key "sk_test"
    Then the status is 404

  Scenario: Full evidence produces the promised scorecard
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000,"bedrooms":3,"bathrooms":3,"parking":2,"floorAreaM2":140,"erfM2":200,"ratesMonthly":1318,"titleType":"freehold","city":"Cape Town","propertyType":"house"},
       "buyer":{"profile":"first_time","grossMonthlyIncome":150000},
       "comparables":[{"price":3000000,"floorAreaM2":130},{"price":3150000,"floorAreaM2":135},{"price":3300000,"floorAreaM2":140},{"price":3250000,"floorAreaM2":138},{"price":3100000,"floorAreaM2":132},{"price":3400000,"floorAreaM2":145}],
       "rentalComparables":[{"monthlyRent":20000,"floorAreaM2":130},{"monthlyRent":22000,"floorAreaM2":140},{"monthlyRent":21000,"floorAreaM2":135},{"monthlyRent":24000,"floorAreaM2":150}]}
      """
    Then the status is 200
    And the response matches the OpenAPI schema
    And the JSON at "scorecard.confidence.percent" is "100"
    And the JSON at "scorecard.investmentScore.provisional" is "false"
    And the JSON at "scorecard.investmentScore.value" is "83"
    And the JSON at "scorecard.decision.label" is "BUY"
    And the JSON at "scorecard.rental.basis" is "rent_per_m2"
    And the JSON at "scorecard.rental.comparablesUsed" is "4"
    And the JSON at "scorecard.rental.estimateMonthly" is "22000"

  Scenario: A far-too-high price caps the score and says walk away
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":4500000,"bedrooms":3,"bathrooms":3,"floorAreaM2":140,"erfM2":200,"ratesMonthly":1318,"titleType":"freehold","city":"Cape Town"},
       "buyer":{"grossMonthlyIncome":150000},
       "comparables":[{"price":3000000,"floorAreaM2":130},{"price":3150000,"floorAreaM2":135},{"price":3300000,"floorAreaM2":140},{"price":3250000,"floorAreaM2":138},{"price":3100000,"floorAreaM2":132},{"price":3400000,"floorAreaM2":145}]}
      """
    Then the response matches the OpenAPI schema
    And the JSON at "scorecard.decision.label" is "WALK AWAY"
    And the JSON at "scorecard.investmentScore.band" is "Weak"

  Scenario: Thin evidence stays provisional and never says BUY
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000,"bedrooms":3,"bathrooms":3,"erfM2":200,"ratesMonthly":1318,"city":"Cape Town"}}
      """
    Then the response matches the OpenAPI schema
    And the JSON at "scorecard.investmentScore.provisional" is "true"
    And the JSON at "scorecard.confidence.band" is "Low"
    And the JSON at "scorecard.decision.label" is "PROCEED WITH CAUTION"

  Scenario: With almost nothing known, no score or risk rating is invented
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000}}
      """
    Then the response matches the OpenAPI schema
    And the JSON at "scorecard.investmentScore.value" is null
    And the JSON at "scorecard.investmentScore.band" is "Insufficient evidence"
    And the JSON at "scorecard.riskScore.value" is null

  Scenario: An investor with a shortfall is never told to buy
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000,"bedrooms":3,"bathrooms":3,"floorAreaM2":140,"erfM2":200,"ratesMonthly":1318,"titleType":"freehold"},
       "buyer":{"profile":"investor","expectedMonthlyRent":15000}}
      """
    Then the response matches the OpenAPI schema
    And the JSON at "scorecard.rental.coversMonthlyCosts" is "false"
    And the JSON at "scorecard.decision.label" is "PROCEED WITH CAUTION"

  Scenario: Rental comparables are validated
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000},"rentalComparables":[{"monthlyRent":50}]}
      """
    Then the status is 422
    And the JSON at "errors.0.field" is "rentalComparables.0.monthlyRent"
