Feature: Production guards

  Scenario Outline: The server only fetches allowed listing hosts
    Then the URL "<url>" is <verdict>

    Examples:
      | url                                             | verdict  |
      | https://www.property24.com/for-sale/x/123       | allowed  |
      | https://property.mg.co.za/some-listing          | allowed  |
      | http://localhost:8080/report                    | rejected |
      | https://property24.com.evil.com/x               | rejected |
      | https://evilproperty24.com/x                    | rejected |
      | https://169.254.169.254/latest/meta-data        | rejected |
      | file:///etc/passwd                              | rejected |
      | https://property24.com:8443/x                   | rejected |

  Scenario: A bot-block page gives a clear instruction
    When I analyse the page "<html><title>Just a moment...</title></html>"
    Then the error mentions "blocked automated access"

  Scenario: A page with no price fails loudly
    When I analyse the page "<html><body>3 Bedroom House for Sale</body></html>"
    Then the error mentions "No asking price found"

  Scenario: An impossible price is rejected
    When I analyse the page "<html><body>Asking price R 12 345 . 3 Bedroom House</body></html>"
    Then the error mentions "looks wrong"
