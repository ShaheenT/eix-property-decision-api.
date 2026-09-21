Feature: Neighbourhood DNA

  Scenario: The layer is opt-in
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000}}
      """
    Then the JSON at "neighbourhood.status" is "not_requested"

  Scenario: Amenities, supplied market data and buyer priorities become a fit score
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000,"bedrooms":3,"bathrooms":2,"erfM2":200,"ratesMonthly":1318,"city":"Cape Town"},
       "neighbourhood":{"location":{"lat":-33.93,"lng":18.47},"priorities":"family","metrics":{"crimePer100k":9000,"benchmarkCrimePer100k":6000,"priceGrowth5yPercent":45,"medianDaysOnMarket":50}}}
      """
    Then the status is 200
    And the response matches the OpenAPI schema
    And the JSON at "neighbourhood.status" is "assessed"
    And the JSON at "neighbourhood.archetype.label" is "Walkable urban village"
    And the JSON at "neighbourhood.dimensions.0.key" is "walkability"
    And the JSON at "neighbourhood.dimensions.0.score" is "76"
    And the JSON at "neighbourhood.dimensions.1.score" is "36"
    And the JSON at "neighbourhood.dimensions.6.score" is "30"
    And the JSON at "neighbourhood.dimensions.7.score" is "65"
    And the JSON at "neighbourhood.dimensions.8.score" is "85"
    And the JSON at "neighbourhood.fit.percent" is "56"
    And the JSON at "neighbourhood.fit.strengths.0" is "Green space is strong (70/100)"
    And the JSON at "neighbourhood.fit.tradeoffs.0" is "Safety is weak (30/100)"
    And the JSON at "neighbourhood.attribution.0" is "© OpenStreetMap contributors (ODbL)"
    And the risk codes include "AREA_SAFETY_CONCERN"
    And the JSON list at "scorecard.decision.reasons" includes "Neighbourhood fit is 56% for family priorities"

  Scenario: Different priorities give a different fit for the same street
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000},
       "neighbourhood":{"location":{"lat":-33.93,"lng":18.47},"priorities":{"greenSpace":5,"education":5}}}
      """
    Then the response matches the OpenAPI schema
    And the JSON at "neighbourhood.fit.priorities" is "custom"
    And the JSON at "neighbourhood.fit.percent" is "68"

  Scenario: An OpenStreetMap outage degrades gracefully
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000},"neighbourhood":{"location":{"lat":-33.94,"lng":18.47}}}
      """
    Then the status is 200
    And the response matches the OpenAPI schema
    And the JSON at "neighbourhood.status" is "partial"
    And the JSON at "neighbourhood.dimensions.0.source" is "not_established"
    And the JSON at "neighbourhood.dimensions.0.evidence" is "OpenStreetMap data was unavailable"
    And the JSON at "neighbourhood.fit.percent" is null

  Scenario: No coordinates is reported, not guessed
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"property":{"askingPrice":3500000},"neighbourhood":{}}
      """
    Then the JSON at "neighbourhood.status" is "partial"
    And the JSON at "neighbourhood.location" is null
    And the JSON at "neighbourhood.dimensions.0.evidence" contains "No coordinates"

  Scenario: Coordinates found on the listing page are used
    When I POST "/v1/decisions" with key "sk_test":
      """
      {"url":"https://property.mg.co.za/x","html":"<html><body>R 2 950 000 3 Bedroom House for Sale in Observatory Cape Town Beds 3 Bathroom 2 Erf Size 270 m² Rates and Taxes R 1 990<script>var m={\"latitude\":\"-33.9366\",\"longitude\":\"18.4713\"}</script></body></html>","neighbourhood":{"priorities":"young_professional"}}
      """
    Then the response matches the OpenAPI schema
    And the JSON at "neighbourhood.location.source" is "listing"
    And the JSON at "neighbourhood.location.lat" is "-33.9366"
    And the JSON at "neighbourhood.status" is "assessed"

  Scenario Outline: Bad neighbourhood input is refused
    When I POST "/v1/decisions" with key "sk_test":
      """
      <body>
      """
    Then the status is 422
    And the JSON at "errors.0.field" is "<field>"

    Examples:
      | body                                                                                   | field                        |
      | {"property":{"askingPrice":3500000},"neighbourhood":{"priorities":"hipster"}}          | neighbourhood.priorities     |
      | {"property":{"askingPrice":3500000},"neighbourhood":{"location":{"lat":51.5,"lng":0}}} | neighbourhood.location.lat   |
      | {"property":{"askingPrice":3500000},"neighbourhood":{"priorities":{"noise":3}}}        | neighbourhood.priorities.noise |

  Scenario: Overpass elements become categorised points with distances
    When I parse this Overpass response around -33.93, 18.47:
      """
      {"elements":[
        {"type":"node","lat":-33.9291,"lon":18.47,"tags":{"shop":"supermarket"}},
        {"type":"way","center":{"lat":-33.93,"lon":18.4715},"tags":{"leisure":"park"}},
        {"type":"node","lat":-33.931,"lon":18.47,"tags":{"highway":"bus_stop"}},
        {"type":"node","lat":-33.931,"lon":18.47,"tags":{"shop":"hairdresser"}}
      ]}
      """
    Then the categories are "grocery,park,transit"
    And the first distance is between 95 and 105 metres
