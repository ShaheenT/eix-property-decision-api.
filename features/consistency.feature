Feature: Scoring consistency and calibration tooling
  These checks prove the scorecard behaves sensibly and consistently. They do not prove it is right about real-world outcomes:
  that needs closed cases run through the calibration harness.

  Scenario: Raising the price never improves the score or the label
    When I sweep the asking price from 2400000 to 4600000 in steps of 100000 for a buyer earning 150000
    Then the investment score never rises as the price rises
    And the decision label never improves as the price rises
    And the score never moves by more than 8 points between steps
    And the label spans both a good outcome and a bad outcome

  Scenario: More income never hurts
    When I sweep the buyer income from 40000 to 200000 in steps of 10000
    Then the score never falls and the risk never rises as income rises

  Scenario: Better comparables never lower the score
    Then raising every comparable by 10 percent never lowers the score

  Scenario: More evidence never lowers confidence
    Then adding evidence never lowers confidence

  Scenario: The scorecard is deterministic and bounded
    Then the same input always gives the same scorecard
    And every score and percentage stays within 0 to 100

  Scenario: The calibration harness computes agreement with outcomes
    Given the calibration cases:
      """
      {"label":"BUY","score":85,"confidence":90,"askingPrice":3000000,"outcome":{"soldPrice":2970000,"expertLabel":"BUY","realizedReturnPercent":9}}
      {"label":"BUY","score":78,"confidence":88,"askingPrice":3200000,"outcome":{"expertLabel":"PROCEED WITH CAUTION","realizedReturnPercent":7}}
      {"label":"PROCEED WITH CAUTION","score":66,"confidence":70,"outcome":{"expertLabel":"PROCEED WITH CAUTION","realizedReturnPercent":5}}
      {"label":"NEGOTIATE","score":58,"confidence":80,"askingPrice":3500000,"outcome":{"soldPrice":3200000,"expertLabel":"NEGOTIATE","realizedReturnPercent":3}}
      {"label":"NEGOTIATE","score":44,"confidence":75,"askingPrice":3500000,"outcome":{"soldPrice":3300000,"expertLabel":"WALK AWAY","realizedReturnPercent":1}}
      {"label":"WALK AWAY","score":30,"confidence":85,"outcome":{"expertLabel":"WALK AWAY","realizedReturnPercent":-2}}
      """
    Then the calibration shows spearman 1, accuracy 0.67 and a NEGOTIATE discount of 7.1 percent
    And spearman of a perfectly opposite ranking is -1

  Scenario: The live smoke check recognises a healthy extraction
    Then the smoke coverage of "p24-house-rates.txt" finds price, bedrooms and city
