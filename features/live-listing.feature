Feature: Full capture of a live Property24 listing
  The fixture is the live page for 42 Queens Rd, Woodstock (fetched 2026-09-20) combined with the rendered
  sections the browser adds (points of interest, bond calculator, recent sales).

  Scenario: Every field on the page is captured
    When I analyse the saved live listing "p24-live-woodstock.txt" with key "sk_test"
    Then the status is 200
    And the response matches the OpenAPI schema
    And the JSON at "listing.listingNumber" is "117106348"
    And the JSON at "listing.status" is "under_offer"
    And the JSON at "listing.listedDate" is "2026-04-09"
    And the JSON at "listing.streetAddress" is "42 Queens Rd, Woodstock"
    And the JSON at "property.address" is "42 Queens Rd, Woodstock"
    And the JSON at "property.suburb" is "Woodstock"
    And the JSON at "property.city" is "Cape Town"
    And the JSON at "property.askingPrice" is "4750000"
    And the JSON at "listing.agency" is "RE/MAX Living"
    And the JSON at "listing.agentName" is "Jorg Hasenbach"
    And the JSON at "listing.receptionRooms" is "4"
    And the JSON at "evidence.4.value" is "200"
    And the JSON at "evidence.5.value" is "110"
    And the JSON at "evidence.6.value" is "1232"
    And the JSON list at "listing.pointsOfInterest" has 8 items
    And the JSON list at "listing.recentSales.addresses" has 5 items
    And the JSON at "listing.recentSales.pricesAvailable" is "false"

  Scenario: The portal's own calculator is captured and checked against ours
    When I analyse the saved live listing "p24-live-woodstock.txt" with key "sk_test"
    Then the JSON at "listing.portalCalculator.monthlyRepayment" is "47423"
    And the JSON at "listing.portalCalculator.onceOffCosts" is "459300"
    And the JSON at "listing.portalCalculator.minGrossMonthlyIncome" is "158076"
    And the JSON at "listing.portalCalculator.impliedInterestRatePercent" is "10.5"
    And the JSON at "listing.portalCalculator.impliedIncomeRulePercent" is "30"
    And the JSON at "listing.portalCalculator.impliedFeesAndBondCosts" is "159444"
    And the JSON at "listing.portalCalculator.eixFeesEstimate" is "142500"

  Scenario: The listing text is read for claims, units, letting and tenants
    When I analyse the saved live listing "p24-live-woodstock.txt" with key "sk_test"
    Then the listing signal codes are "UNDER_OFFER,MULTI_UNIT,SHORT_TERM_LETTING,TENANT_IN_PLACE,INCOME_CLAIM,PERIOD_BUILDING"
    And the JSON at "listing.claims.statedMonthlyIncome" is "40000"
    And the JSON at "listing.claims.statedYieldPercent" is "10"
    And the JSON at "listing.claims.units" is "4"
    And the JSON at "listing.claims.shortTermUnits" is "3"
    And the JSON at "listing.claims.tenantedUnits" is "1"

  Scenario: The income claim is tested against the numbers
    When I analyse the saved live listing "p24-live-woodstock.txt" with key "sk_test"
    Then the JSON at "incomeTest.impliedGrossYieldPercent" is "10.1"
    And the JSON at "incomeTest.netYieldOnClaimPercent" is "8.8"
    And the JSON at "incomeTest.bond" is "42680.74"
    And the JSON at "incomeTest.coversBond" is "false"
    And the JSON at "incomeTest.monthlyShortfallVsBond" is "2680.74"
    And the JSON at "incomeTest.breakEvenMonthlyIncome" is "47871.07"
    And the JSON at "incomeTest.incomeUpliftNeededPercent" is "19.7"
    And the JSON at "incomeTest.breakEvenPerUnit" is "11967.77"
    And the JSON at "incomeTest.nightlyRateIfAllShortTerm.1.nightlyRatePerUnit" is "605.66"
    And the JSON at "incomeTest.verdict" contains "does not cover the bond"

  Scenario: The claim never feeds the score, and the risks are raised
    When I analyse the saved live listing "p24-live-woodstock.txt" with key "sk_test"
    Then the JSON at "scorecard.rental" is null
    And the risk codes include "MULTI_UNIT_CONVERSION"
    And the risk codes include "SHORT_TERM_LETTING_IN_USE"
    And the risk codes include "TENANT_IN_OCCUPATION"
    And the risk codes include "INCOME_CLAIM_UNVERIFIED"
    And the risk codes include "INCOME_BELOW_BOND"
    And the risk codes include "LISTING_UNDER_OFFER"
    And the risk codes include "FLOOR_EXCEEDS_ERF"
    And the risk codes include "OLDER_PROPERTY"
    And the risk codes include "ABOVE_MUNICIPAL_VALUE"
    And the risk codes exclude "HIGH_SITE_COVERAGE"
    And the JSON at "priceEvidence.municipalValue.low" is "2515093"
    And the JSON at "priceEvidence.municipalValue.high" is "2919938"
    And the JSON list at "displayGuidance.requiredNotices" has a notice containing "listing agent"

  Scenario: The investigator's document pack names the paperwork that settles each finding
    When I analyse the saved live listing "p24-live-woodstock.txt" with key "sk_test"
    Then the document pack includes "lease_agreements" as "essential"
    And the document pack includes "short_term_letting_evidence" as "essential"
    And the document pack includes "heritage_permit_history" as "essential"
    And the document pack includes "building_plans" as "essential"
    And the document pack includes "zoning_overlay" as "essential"
    And the document pack includes "inspection" as "essential"
    And the document "heritage_permit_history" has URL containing "hwc.org.za"
    And the document "short_term_letting_evidence" resolves "INCOME_BELOW_BOND"

  Scenario: Navigation menus cannot fake a rental, a tenant or a status
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"url":"https://www.property24.com/for-sale/woodstock/cape-town/western-cape/10164/1","html":"<html><body>House to Rent in Woodstock Tenant Screenings Auctions in Woodstock 3 Bedroom House for Sale in Woodstock R 2 000 000 Beds 3 Bathroom 2</body></html>"}
      """
    Then the status is 200
    And the JSON at "property.askingPrice" is "2000000"
    And the JSON at "listing.status" is "listed"
    And the listing signal codes are ""
