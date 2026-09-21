Feature: Listing extraction

  Scenario: Title-style listing text is parsed without guessing
    Given a listing page saying "3 Bedroom House for Sale in Observatory. Asking price R 3 500 000. 3 Bathrooms. 2 Parking. Erf Size 200 m². Rates and taxes R 1 318. Garden. Fibre."
    When I parse the listing
    Then the price is 3500000
    And the erf size is 200
    And the floor size is not found
    And the levy is not found

  Scenario Outline: Real portal text is parsed correctly (<fixture>)
    Given the saved listing "<fixture>" at "<url>"
    When I parse the listing
    Then these fields are extracted: "<expected>"

    Examples:
      | fixture                              | url                                                                        | expected                                                                                                              |
      | mg-house-capetown.txt                | https://property.mg.co.za/3-bedroom-house-for-sale-in-observatory-115010647 | price=2950000;beds=3;baths=2;parking=1;floor=117;erf=270;levy=-;rates=1990;city=Cape Town;type=house;title=unknown   |
      | mg-apartment-capetown.txt            | https://property.mg.co.za/3-bedroom-apartment-flat-for-sale-in-observatory-115117109 | price=3200000;beds=3;baths=2;parking=1;floor=90;erf=90;levy=4838;rates=1431;city=Cape Town;type=apartment;title=sectional |
      | mg-house-joburg-placeholder-levy.txt | https://property.mg.co.za/3-bedroom-house-for-sale-in-observatory-115152900 | price=2000000;beds=3;baths=2;parking=6;floor=-;erf=2164;levy=-;rates=2300;city=Johannesburg;type=house;title=freehold |
      | chaseveritt-house.txt                | https://m.chaseveritt.co.za/results/residential/for-sale/cape-town/observatory/house/4257501 | price=4250000;beds=3;baths=2;parking=2;floor=151;erf=246;levy=-;rates=2500;city=Cape Town;type=house;title=unknown   |

  Scenario Outline: More real listings across portals and agents (<fixture>)
    Given the saved listing "<fixture>" at "<url>"
    When I parse the listing
    Then these fields are extracted: "<expected>"

    Examples:
      | fixture                    | url                                                                          | expected                                                                                                  |
      | p24-house-no-floor.txt     | https://property.mg.co.za/3-bedroom-house-for-sale-in-observatory-115287134  | price=3300000;beds=3;baths=2;parking=-;floor=-;erf=157;rates=-;city=Cape Town;type=house;listing=sale      |
      | p24-house-rates.txt        | https://property.mg.co.za/3-bedroom-house-for-sale-in-observatory-115838890  | price=3500000;beds=3;baths=2;parking=1;floor=-;erf=133;rates=1500;city=Cape Town;type=house               |
      | p24-2bed-no-sizes.txt      | https://property.mg.co.za/2-bedroom-house-for-sale-in-observatory-114975777  | price=2795000;beds=2;baths=1;parking=3;floor=-;erf=-;city=Cape Town;type=house                            |
      | p24-4bed.txt               | https://property.mg.co.za/4-bedroom-house-for-sale-in-observatory-115569516  | price=3950000;beds=4;baths=3;parking=1;erf=357;city=Cape Town                                              |
      | p24-joburg-garages.txt     | https://property.mg.co.za/3-bedroom-house-for-sale-in-observatory-114716841  | price=2495000;beds=3;baths=2;parking=4;erf=2171;rates=2045;city=Johannesburg                               |
      | greeff-house.txt           | https://www.greeff.co.za/results/residential/for-sale/cape-town/observatory/house/1785769 | price=5759999;beds=3;baths=3.5;parking=1;city=Cape Town;type=house                       |
      | p24-rental.txt             | https://property.mg.co.za/3-bedroom-house-to-rent-in-observatory-115483730   | listing=rental;rent=15000;price=-;beds=3;baths=1;parking=1;erf=204;city=Cape Town                          |
      | leapfrog-rental.txt        | https://leapfrog.co.za/listing/4417094/observatory-cape-town-lfml-4204       | listing=rental;rent=22000;price=-;beds=3;baths=3;erf=118;city=Cape Town;type=house                         |
