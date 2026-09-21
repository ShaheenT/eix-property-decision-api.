Feature: Address geocoding

  Scenario: An exact address is matched and the request follows the Nominatim policy
    Given a geocoder with a 0 ms minimum interval
    When I geocode "101 Chamberlain Street, Woodstock" in "Woodstock", "Cape Town"
    Then the geocoding status is "ok" with precision "address" after 1 request
    And the service saw a user agent of "eix-test/1.0 (test@example.com)" and asked for "jsonv2" in country "za"

  Scenario: Without a house-number match it falls back to the street
    Given the geocoding service answers in "street-only" mode
    And a geocoder with a 0 ms minimum interval
    When I geocode "101 Chamberlain Street, Woodstock" in "Woodstock", "Cape Town"
    Then the geocoding status is "ok" with precision "street" after 2 requests

  Scenario: Without a street match it falls back to the suburb centre and says so
    Given the geocoding service answers in "suburb-only" mode
    And a geocoder with a 0 ms minimum interval
    When I geocode "101 Chamberlain Street, Woodstock" in "Woodstock", "Cape Town"
    Then the geocoding status is "ok" with precision "suburb" after 3 requests

  Scenario: A same-named street in another city is rejected
    Given the geocoding service answers in "wrong-place" mode
    And a geocoder with a 0 ms minimum interval
    When I geocode "101 Chamberlain Street, Woodstock" in "Woodstock", "Cape Town"
    Then the geocoding status is "mismatch" after 3 requests

  Scenario: A result outside South Africa is rejected
    Given the geocoding service answers in "outside-sa" mode
    And a geocoder with a 0 ms minimum interval
    When I geocode "101 Chamberlain Street, Woodstock" in "Woodstock", "Cape Town"
    Then the geocoding status is "mismatch" after 3 requests

  Scenario: An unknown place is not found rather than guessed
    Given the geocoding service answers in "none" mode
    And a geocoder with a 0 ms minimum interval
    When I geocode "1 Nowhere Road" in "Woodstock", "Cape Town"
    Then the geocoding status is "not_found" after 3 requests

  Scenario: A service failure is reported as unavailable
    Given the geocoding service answers in "down" mode
    And a geocoder with a 0 ms minimum interval
    When I geocode "101 Chamberlain Street, Woodstock" in "Woodstock", "Cape Town"
    Then the geocoding status is "unavailable" after 1 request

  Scenario: Repeat lookups are served from the cache
    Given a geocoder with a 0 ms minimum interval
    When I geocode "101 Chamberlain Street, Woodstock" in "Woodstock", "Cape Town"
    And I geocode "101 Chamberlain Street, Woodstock" in "Woodstock", "Cape Town"
    Then the service was called 1 times

  Scenario: Requests are spaced to respect the one-request-a-second policy
    Given a geocoder with a 300 ms minimum interval
    When I geocode "101 Chamberlain Street, Woodstock" in "Woodstock", "Cape Town"
    And I geocode "5 Devon Street, Woodstock" in "Woodstock", "Cape Town"
    Then the two requests were at least 280 ms apart

  Scenario: Nothing to search for makes no request
    Given a geocoder with a 0 ms minimum interval
    When I geocode with nothing to search for
    Then the geocoding status is "not_found" after 0 requests
