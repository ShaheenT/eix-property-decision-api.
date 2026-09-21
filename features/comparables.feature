Feature: Comparables engine, market data and display rules

  Scenario: A tight cluster keeps all its members and is strong evidence
    Given the subject "{\"floorSqm\":140,\"beds\":3,\"type\":\"house\"}"
    And the comparables:
      """
      [{"value":3000000,"floorSqm":130},{"value":3150000,"floorSqm":135},{"value":3300000,"floorSqm":140},{"value":3250000,"floorSqm":138},{"value":3100000,"floorSqm":132},{"value":3400000,"floorSqm":145}]
      """
    When I estimate as at "2026-09-20"
    Then the strength is "strong"
    And 6 comparables are used
    And 0 outliers are dropped
    And the value is between 3280000 and 3300000

  Scenario: Other property types are excluded, not averaged in
    Given the subject "{\"floorSqm\":140,\"beds\":3,\"type\":\"house\"}"
    And the comparables:
      """
      [{"value":3000000,"floorSqm":130,"type":"house"},{"value":3150000,"floorSqm":135,"type":"house"},{"value":3300000,"floorSqm":140,"type":"house"},
       {"value":1500000,"floorSqm":140,"type":"apartment"},{"value":1600000,"floorSqm":140,"type":"flat"},{"value":1400000,"floorSqm":140,"type":"apartment"}]
      """
    When I estimate as at "2026-09-20"
    Then 3 comparables are used
    And 3 comparables are excluded as dissimilar
    And the value is between 3100000 and 3300000

  Scenario: Too few genuinely similar comparables is insufficient, not guessed
    Given the subject "{\"floorSqm\":140,\"beds\":3,\"type\":\"house\"}"
    And the comparables:
      """
      [{"value":3000000,"floorSqm":130,"type":"house"},{"value":3150000,"floorSqm":135,"type":"house"},
       {"value":1500000,"floorSqm":140,"type":"apartment"},{"value":1600000,"floorSqm":140,"type":"flat"},{"value":1400000,"floorSqm":140,"type":"apartment"}]
      """
    When I estimate as at "2026-09-20"
    Then the strength is "insufficient"

  Scenario: A genuine outlier is dropped
    Given the subject "{\"floorSqm\":140,\"beds\":3,\"type\":\"house\"}"
    And the comparables:
      """
      [{"value":3000000,"floorSqm":130},{"value":3100000,"floorSqm":135},{"value":3200000,"floorSqm":140},{"value":3150000,"floorSqm":138},{"value":3050000,"floorSqm":132},{"value":6500000,"floorSqm":140}]
      """
    When I estimate as at "2026-09-20"
    Then 1 outliers are dropped
    And 5 comparables are used

  Scenario: Real public Observatory asking prices are too spread out to set a benchmark
    Given the subject "{\"erfSqm\":200,\"beds\":3,\"type\":\"house\"}"
    And the comparables loaded from the file "examples/observatory-asking-pool.json"
    When I estimate as at "2026-09-20"
    Then the strength is "weak"
    And the dispersion is above 0.3

  Scenario: Spread-out comparables are reported as unusable, not averaged
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000,"bedrooms":3,"erfM2":200,"propertyType":"house","titleType":"freehold","city":"Cape Town"},
       "comparables":[{"price":1995000,"bedrooms":3,"propertyType":"house","erfM2":117,"priceType":"asking"},{"price":3300000,"bedrooms":3,"propertyType":"house","erfM2":157,"priceType":"asking"},
                      {"price":3500000,"bedrooms":3,"propertyType":"house","erfM2":133,"priceType":"asking"},{"price":1899000,"bedrooms":3,"propertyType":"house","erfM2":120,"priceType":"asking"},
                      {"price":2950000,"bedrooms":3,"propertyType":"house","erfM2":270,"priceType":"asking"},{"price":4250000,"bedrooms":3,"propertyType":"house","erfM2":246,"priceType":"asking"}]}
      """
    Then the response matches the OpenAPI schema
    And the JSON at "priceEvidence.comparables" is null
    And the risk codes include "NO_COMPARABLES"
    And the JSON at "displayGuidance.priceVerdict" is "hide"
    And the JSON list at "displayGuidance.requiredNotices" has a notice containing "not enough comparable evidence"

  Scenario: Asking-price comparables are flagged and count for less
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000,"bedrooms":3,"bathrooms":3,"floorAreaM2":140,"erfM2":200,"ratesMonthly":1318,"titleType":"freehold","propertyType":"house"},
       "comparables":[{"price":3000000,"floorAreaM2":130,"priceType":"asking"},{"price":3150000,"floorAreaM2":135,"priceType":"asking"},{"price":3300000,"floorAreaM2":140,"priceType":"asking"},{"price":3250000,"floorAreaM2":138,"priceType":"asking"},{"price":3100000,"floorAreaM2":132,"priceType":"asking"},{"price":3400000,"floorAreaM2":145,"priceType":"asking"}]}
      """
    Then the response matches the OpenAPI schema
    And the JSON at "priceEvidence.comparables.askingPriceSharePercent" is "100"
    And the JSON at "scorecard.confidence.areas.4.pts" is "23"
    And the JSON list at "displayGuidance.requiredNotices" has a notice containing "asking prices"

  Scenario: A market data provider fills in comparables and rentals
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000,"bedrooms":3,"bathrooms":3,"floorAreaM2":140,"erfM2":200,"ratesMonthly":1318,"titleType":"freehold","propertyType":"house","suburb":"Observatory","city":"Cape Town"},"marketData":"provider"}
      """
    Then the response matches the OpenAPI schema
    And the JSON at "marketData.source" is "provider"
    And the JSON at "marketData.status" is "ok"
    And the JSON at "marketData.salesReceived" is "6"
    And the JSON at "marketData.rentalsReceived" is "4"
    And the JSON at "priceEvidence.comparables.count" is "6"
    And the JSON at "scorecard.rental.basis" is "rent_per_m2"
    And the JSON at "displayGuidance.priceVerdict" is "show"
    And the JSON at "displayGuidance.rentEstimate" is "show"

  Scenario: A failing provider never breaks the decision
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000,"suburb":"Broken"},"marketData":"provider"}
      """
    Then the status is 200
    And the response matches the OpenAPI schema
    And the JSON at "marketData.status" is "unavailable"
    And the JSON at "priceEvidence.comparables" is null

  Scenario: An empty provider answer is reported as empty
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000,"suburb":"Nowhere"},"marketData":"provider"}
      """
    Then the JSON at "marketData.status" is "empty"

  Scenario: Asking for a provider that is not configured is reported
    Given the API has no market data provider configured
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000},"marketData":"provider"}
      """
    Then the JSON at "marketData.status" is "not_configured"

  Scenario: Public listings become comparables, sales and rentals separately
    When I extract comparables from the saved listings "p24-house-rates.txt, p24-4bed.txt, p24-rental.txt, leapfrog-rental.txt, p24-rental.txt" with key "sk_test"
    Then the status is 200
    And the JSON list at "sales" has 2 items
    And the JSON list at "rentals" has 3 items
    And the JSON at "sales.0.priceType" is "asking"
    And the JSON at "sales.0.price" is "3500000"
    And the JSON at "rentals.1.monthlyRent" is "22000"

  Scenario: Extraction only accepts allowed listing hosts
    When I POST "/v1/comparables/extract" with key "sk_test":
      """
      {"items":[{"url":"http://localhost:9/x","html":"R 2 000 000 3 Bedroom House for Sale"}]}
      """
    Then the status is 200
    And the JSON list at "sales" has 0 items
    And the JSON at "skipped.0.reason" is "URL_NOT_ALLOWED"

  Scenario: Thin evidence hides the score, the price verdict and the rent
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000}}
      """
    Then the JSON at "displayGuidance.investmentScore" is "hide"
    And the JSON at "displayGuidance.priceVerdict" is "hide"
    And the JSON at "displayGuidance.rentEstimate" is "hide"
    And the JSON at "displayGuidance.decisionLabel" is "show_as_provisional"
    And the JSON list at "displayGuidance.requiredNotices" has a notice containing "Provisional"

  Scenario: Full evidence shows everything with no provisional notice
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000,"bedrooms":3,"bathrooms":3,"floorAreaM2":140,"erfM2":200,"ratesMonthly":1318,"titleType":"freehold","propertyType":"house","city":"Cape Town"},
       "buyer":{"grossMonthlyIncome":150000},"marketData":"provider"}
      """
    Then the JSON at "displayGuidance.investmentScore" is "show"
    And the JSON at "displayGuidance.decisionLabel" is "show"
    And the JSON list at "displayGuidance.requiredNotices" has no notice containing "Provisional"

  Scenario: Scoring thresholds can be tuned without code, and the version says so
    Given the scoring config "{\"buy\":{\"minScore\":99}}"
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000,"bedrooms":3,"bathrooms":3,"floorAreaM2":140,"erfM2":200,"ratesMonthly":1318,"titleType":"freehold","propertyType":"house","city":"Cape Town"},
       "buyer":{"grossMonthlyIncome":150000},"marketData":"provider"}
      """
    Then the JSON at "scorecard.scoringVersion" is "2026.1+custom"
    And the JSON at "scorecard.decision.label" is "PROCEED WITH CAUTION"

  Scenario: Without a checked price the score stays provisional and BUY is impossible
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":2800000,"bedrooms":3,"bathrooms":2,"floorAreaM2":140,"erfM2":200,"ratesMonthly":1318,"titleType":"freehold","propertyType":"house","city":"Cape Town","features":["solar"]},
       "buyer":{"grossMonthlyIncome":150000,"expectedMonthlyRent":24000}}
      """
    Then the response matches the OpenAPI schema
    And the JSON at "scorecard.confidence.percent" is "71"
    And the JSON at "scorecard.investmentScore.provisional" is "true"
    And the JSON at "scorecard.decision.label" is "PROCEED WITH CAUTION"
    And the JSON at "displayGuidance.decisionLabel" is "show_as_provisional"
