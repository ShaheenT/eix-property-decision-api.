Feature: Property decision engine

  Scenario: Costs match SARS 2026/27 duty and standard bond maths
    Given an asking price of 3500000 with 10% deposit at 11.5% over 20 years
    When I run the decision engine
    Then the monthly bond is 33592.53
    And the transfer duty is 162356

  Scenario: No comparables means no fairness verdict
    Given an asking price of 3500000 with 10% deposit at 10.5% over 20 years
    When I run the decision engine
    Then the status is "Gather evidence"

  Scenario: Comparables below asking trigger negotiation
    Given an asking price of 3500000 with 10% deposit at 10.5% over 20 years
    And comparable sales of 2900000, 3000000, 3100000 and 3200000
    When I run the decision engine
    Then the status is "Negotiate"

  Scenario: A stretched income is flagged
    Given an asking price of 3500000 with 10% deposit at 10.5% over 20 years
    And a gross monthly income of 60000
    When I run the decision engine
    Then the status is "Affordability stretch"

  Scenario: Rates bill implies a Cape Town municipal value range
    Given an asking price of 3500000 with 10% deposit at 10.5% over 20 years
    And a Cape Town listing with rates of 1318 a month
    When I run the decision engine
    Then the implied municipal value is between 2600000 and 3200000
    And the price must rise by more than 10% to break even
