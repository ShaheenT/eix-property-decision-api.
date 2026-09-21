Feature: Buyer document pack

  Scenario: An older Cape Town freehold house gets verified free lookups and stronger checks
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000,"bedrooms":3,"bathrooms":3,"erfM2":200,"ratesMonthly":1318,"city":"Cape Town","titleType":"freehold","features":["victorian","fireplace"]}}
      """
    Then the status is 200
    And the response matches the OpenAPI schema
    And the JSON at "documents.jurisdiction" is "cape_town"
    And the document "valuation_roll" costs "free"
    And the document "valuation_roll" has URL containing "capetown.gov.za/propertyvaluations"
    And the document "zoning_overlay" has URL containing "citymaps.capetown.gov.za"
    And the document pack includes "heritage_status" as "essential"
    And the document pack includes "building_plans" as "essential"
    And the document pack includes "inspection" as "essential"
    And the document pack includes "rates_clearance" as "essential"
    And the document pack includes "title_deed" as "recommended"
    And the document pack does not include "body_corporate_pack"
    And the document pack does not include "levy_clearance"

  Scenario: Documents are linked to the risks they settle
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000,"bedrooms":3,"bathrooms":3,"erfM2":200,"ratesMonthly":1318,"city":"Cape Town","titleType":"freehold"}}
      """
    Then the document "valuation_roll" resolves "ABOVE_MUNICIPAL_VALUE"
    And the document "comparable_sales" resolves "NO_COMPARABLES"
    And the document pack includes "comparable_sales" as "essential"

  Scenario: Supplying comparables downgrades the comparables task
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000,"titleType":"freehold"},
       "comparables":[{"price":3000000},{"price":3100000},{"price":3200000}]}
      """
    Then the document pack includes "comparable_sales" as "recommended"

  Scenario: A sectional title unit needs the body corporate pack and levy clearance
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":2200000,"bedrooms":2,"bathrooms":2,"floorAreaM2":85,"ratesMonthly":1200,"levyMonthly":2300,"city":"Cape Town","titleType":"sectional"}}
      """
    Then the response matches the OpenAPI schema
    And the document pack includes "body_corporate_pack" as "essential"
    And the document pack includes "levy_clearance" as "essential"

  Scenario: Unknown title type asks the buyer to find out
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000}}
      """
    Then the document pack includes "body_corporate_pack" as "recommended"
    And the document pack includes "title_deed" as "recommended"

  Scenario: Other municipalities get generic guidance and no invented links
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":2000000,"bedrooms":3,"bathrooms":2,"erfM2":600,"city":"Johannesburg","titleType":"freehold"}}
      """
    Then the response matches the OpenAPI schema
    And the JSON at "documents.jurisdiction" is "other"
    And the document "valuation_roll" has no URL
    And the document "zoning_overlay" has no URL
    And the document "rates_clearance" costs "in_transfer_costs"

  Scenario: Items are ordered by when the buyer needs them
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000,"titleType":"freehold","city":"Cape Town"}}
      """
    Then the JSON at "documents.items.0.id" is "valuation_roll"
    And the JSON at "documents.items.0.stage" is "before_offer"
    And the last document is "rates_clearance"

  Scenario: An estate home needs the homeowners association pack and shows unknown costs as unknown
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":30000000,"bedrooms":4,"bathrooms":4,"propertyType":"house","suburb":"Kenrock Country Estate","city":"Cape Town"}}
      """
    Then the response matches the OpenAPI schema
    And the document pack includes "hoa_pack" as "essential"
    And the document pack includes "hoa_clearance" as "essential"
    And the document pack does not include "body_corporate_pack"
    And the risk codes include "LEVY_NOT_STATED"
    And the JSON at "costs.monthly.rates" is null
    And the JSON at "costs.monthly.levy" is null
    And the JSON at "costs.monthlyExcludes.0" is "rates"
    And the JSON at "costs.monthlyExcludes.1" is "levy"

  Scenario: Known rates and a freehold non-estate house show a real zero levy, not a gap
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000,"ratesMonthly":1318,"titleType":"freehold","suburb":"Observatory"}}
      """
    Then the JSON at "costs.monthly.rates" is "1318"
    And the JSON at "costs.monthly.levy" is "0"
    And the JSON list at "costs.monthlyExcludes" has 0 items
