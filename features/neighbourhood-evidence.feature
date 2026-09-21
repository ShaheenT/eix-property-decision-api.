Feature: Neighbourhood DNA tiles say why they are empty

  Scenario: A static page is reported as not fully loaded, never as "nothing there"
    When I analyse the saved live listing "p24-static-chamberlain.txt" with key "sk_test"
    Then the response matches the OpenAPI schema
    And the JSON at "property.address" is "101 Chamberlain Street, Woodstock"
    And the JSON at "property.askingPrice" is "4995000"
    And the JSON at "listing.capture.mode" is "supplied_html"
    And the JSON at "listing.capture.sections.0.status" is "captured"
    And the JSON at "listing.capture.sections.1.status" is "not_found"
    And the JSON at "listing.capture.sections.2.status" is "not_found"
    And the JSON at "listing.capture.sections.3.status" is "not_found"
    And the JSON at "listing.capture.warning" contains "JavaScript"
    And the JSON at "neighbourhood.areas.0.status" is "no_evidence"
    And the JSON at "neighbourhood.areas.0.reason" is "not_requested"
    And the JSON at "neighbourhood.areas.0.summary" contains "not captured"

  Scenario: With the layer requested but no coordinates, the tiles say the area was not checked
    When I analyse the saved live listing "p24-static-chamberlain.txt" requesting the neighbourhood layer without geocoding with key "sk_test"
    Then the JSON at "neighbourhood.mapStatus" is "no_coordinates"
    And the JSON at "neighbourhood.geocoding.status" is "disabled"
    And the JSON at "neighbourhood.areas.0.reason" is "not_retrieved"
    And the JSON at "neighbourhood.areas.0.summary" contains "No coordinates"
    And the JSON at "neighbourhood.areas.3.summary" contains "No safety score is inferred"
    And the JSON at "neighbourhood.areas.5.reason" is "not_retrieved"
    And the JSON at "neighbourhood.areas.5.summary" contains "Market evidence not retrieved"

  Scenario: A fully rendered page fills the tiles from the listing's own nearby places
    When I analyse the saved live listing "p24-live-woodstock.txt" with key "sk_test"
    Then the JSON at "listing.capture.mode" is "supplied_html"
    And the JSON at "listing.capture.sections.1.status" is "captured"
    And the JSON at "listing.capture.sections.2.status" is "captured"
    And the JSON at "listing.capture.sections.3.status" is "captured"
    And the JSON at "listing.capture.warning" is null
    And the JSON at "neighbourhood.place.suburb" is "Woodstock"
    And the JSON at "neighbourhood.place.province" is "Western Cape"
    And the JSON at "neighbourhood.areas.0.status" is "evidence_found"
    And the JSON at "neighbourhood.areas.0.summary" contains "Woodstock (720 m)"
    And the JSON at "neighbourhood.areas.0.source" is "listing"
    And the JSON at "neighbourhood.areas.1.summary" contains "Mountain Road Primary (390 m)"
    And the JSON at "neighbourhood.areas.1.summary" contains "Holy Cross Rc Primary (570 m)"
    And the JSON at "neighbourhood.areas.2.summary" contains "Woodstock Lounge (650 m)"
    And the JSON at "neighbourhood.areas.4.reason" is "not_requested"
    And the JSON at "neighbourhood.areas.5.summary" contains "days on the market and now under offer"
    And the JSON at "neighbourhood.areas.5.status" is "no_evidence"

  Scenario: The recycling bins under "Transport and Public Services" are not counted as transport
    When I analyse the saved live listing "p24-live-woodstock.txt" with key "sk_test"
    Then the JSON list at "neighbourhood.areas.0.items" has 1 items

  Scenario: A map lookup that ran and found nothing is different from one that failed
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000,"suburb":"Woodstock","city":"Cape Town"},"neighbourhood":{"location":{"lat":-33.95,"lng":18.45}}}
      """
    Then the response matches the OpenAPI schema
    And the JSON at "neighbourhood.mapStatus" is "ok"
    And the JSON at "neighbourhood.areas.0.reason" is "none_found"
    And the JSON at "neighbourhood.areas.0.summary" contains "None mapped"
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000,"suburb":"Woodstock","city":"Cape Town"},"neighbourhood":{"location":{"lat":-33.94,"lng":18.45}}}
      """
    Then the JSON at "neighbourhood.mapStatus" is "unavailable"
    And the JSON at "neighbourhood.areas.0.reason" is "not_retrieved"
    And the JSON at "neighbourhood.areas.0.summary" contains "unchecked, not empty"

  Scenario: Map evidence carries scores only where a scored dimension exists
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000,"suburb":"Woodstock","city":"Cape Town"},
       "neighbourhood":{"location":{"lat":-33.93,"lng":18.47},"metrics":{"crimePer100k":9000,"benchmarkCrimePer100k":6000,"priceGrowth5yPercent":45,"medianDaysOnMarket":50}}}
      """
    Then the response matches the OpenAPI schema
    And the JSON at "neighbourhood.areas.0.source" is "openstreetmap"
    And the JSON at "neighbourhood.areas.0.score" is "36"
    And the JSON at "neighbourhood.areas.3.score" is "30"
    And the JSON at "neighbourhood.areas.4.score" is "70"
    And the JSON at "neighbourhood.areas.5.score" is "75"

  Scenario Outline: Province comes from the city, and an unknown city is never guessed
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":2000000,"city":"<city>"}}
      """
    Then the JSON at "neighbourhood.place.province" is "<province>"

    Examples:
      | city         | province     |
      | Cape Town    | Western Cape |
      | Johannesburg | Gauteng      |
      | Durban       | KwaZulu-Natal |
      | Springfield  | null         |

  Scenario: Fibre-ready is not reported as fibre
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"url":"https://www.property24.com/for-sale/woodstock/cape-town/western-cape/10164/2","html":"<html><body>3 Bedroom House for Sale in Woodstock R 2 000 000 Beds 3 Bathroom 2 Secure parking, Fibre-ready</body></html>"}
      """
    Then the listing signal codes are "FIBRE_READY"
    And the JSON list at "listing.features" has 1 items
    And the JSON at "listing.features.0" is "fibre-ready"

  Scenario: Police and fire stations become safety infrastructure points
    When I parse this Overpass response around -33.93, 18.47:
      """
      {"elements":[
        {"type":"node","lat":-33.9291,"lon":18.47,"tags":{"amenity":"police"}},
        {"type":"node","lat":-33.931,"lon":18.47,"tags":{"amenity":"fire_station"}}
      ]}
      """
    Then the categories are "safety,safety"

  Scenario: An empty map answer is never scored as zero
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000,"city":"Cape Town"},"neighbourhood":{"location":{"lat":-33.95,"lng":18.45}}}
      """
    Then the JSON at "neighbourhood.dimensions.0.score" is null
    And the JSON at "neighbourhood.dimensions.0.source" is "not_established"
    And the JSON at "neighbourhood.fit.percent" is null

  Scenario: The listing's street address is geocoded and feeds the map tiles
    When I analyse the saved live listing "p24-live-woodstock.txt" requesting the neighbourhood layer with key "sk_test"
    Then the response matches the OpenAPI schema
    And the JSON at "neighbourhood.geocoding.status" is "ok"
    And the JSON at "neighbourhood.location.source" is "geocoded"
    And the JSON at "neighbourhood.location.precision" is "address"
    And the JSON at "neighbourhood.location.matchedAs" contains "42 Queens Rd"
    And the JSON at "neighbourhood.mapStatus" is "ok"
    And the JSON at "neighbourhood.attribution.1" contains "Nominatim"
    And the JSON at "neighbourhood.areas.0.source" is "openstreetmap"
    And the JSON at "neighbourhood.areas.0.score" is "36"
    And the JSON at "neighbourhood.areas.3.reason" is "none_found"

  Scenario: A suburb-centre anchor is labelled and lowers confidence
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000,"suburb":"Woodstock","city":"Cape Town"},"neighbourhood":{}}
      """
    Then the response matches the OpenAPI schema
    And the JSON at "neighbourhood.location.precision" is "suburb"
    And the JSON at "neighbourhood.dimensions.0.evidence" contains "anchored on the suburb centre"
    And the JSON at "neighbourhood.confidencePercent" is "40"

  Scenario: A street address given in a structured request is geocoded too
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":4995000,"address":"101 Chamberlain Street, Woodstock","suburb":"Woodstock","city":"Cape Town"},"neighbourhood":{}}
      """
    Then the response matches the OpenAPI schema
    And the JSON at "property.address" is "101 Chamberlain Street, Woodstock"
    And the JSON at "neighbourhood.location.matchedAs" contains "Chamberlain"
    And the JSON at "neighbourhood.location.precision" is "address"

  Scenario Outline: A geocoder that fails or finds nothing leaves the tiles honestly unchecked
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000,"address":"<address>","suburb":"Woodstock","city":"Cape Town"},"neighbourhood":{}}
      """
    Then the response matches the OpenAPI schema
    And the JSON at "neighbourhood.geocoding.status" is "<status>"
    And the JSON at "neighbourhood.mapStatus" is "no_coordinates"
    And the JSON at "neighbourhood.areas.0.reason" is "not_retrieved"
    And the JSON at "neighbourhood.location" is null

    Examples:
      | address            | status      |
      | 5 Broken Road      | unavailable |
      | 1 Nowhere Street   | not_found   |

  Scenario: Supplied coordinates are used as they are and never geocoded
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000,"address":"5 Broken Road","suburb":"Woodstock","city":"Cape Town"},"neighbourhood":{"location":{"lat":-33.93,"lng":18.47}}}
      """
    Then the JSON at "neighbourhood.geocoding.status" is "not_needed"
    And the JSON at "neighbourhood.location.source" is "supplied"
    And the JSON at "neighbourhood.location.precision" is "supplied"

  Scenario: Nothing to geocode is reported, not guessed
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000,"city":"Cape Town"},"neighbourhood":{}}
      """
    Then the JSON at "neighbourhood.geocoding.status" is "not_found"
    And the JSON at "neighbourhood.geocoding.attempts" is "0"

  Scenario: Geocoding can be switched off per request
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000,"address":"101 Chamberlain Street, Woodstock","suburb":"Woodstock","city":"Cape Town"},"neighbourhood":{"geocode":false}}
      """
    Then the JSON at "neighbourhood.geocoding.status" is "disabled"
    And the JSON at "neighbourhood.mapStatus" is "no_coordinates"

  Scenario: The geocode switch is validated
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000},"neighbourhood":{"geocode":"yes"}}
      """
    Then the status is 422
    And the JSON at "errors.0.field" is "neighbourhood.geocode"
