# Capture links

`/erfassen` opens the existing booking form after authentication. Opening or reloading
the URL does not create a payee or booking. The owner must review the fields and press
**Speichern** (or the existing save shortcut). Closing uses the normal discard guard.

All parameters are optional and URL encoded:

| Parameter | Value |
| --- | --- |
| `betrag` | Euro units, at most two decimal places, comma or decimal point; no arithmetic or thousands separators. An unsigned or negative value selects Ausgabe; an explicit encoded `+` selects Einnahme. |
| `empfaenger` | Plain text, at most 200 characters, without control characters. The normal save validation also applies. |
| `kategorie` | Existing visible category ID, not its label; at most 64 ASCII letters, digits, underscores or hyphens. |
| `konto` | Existing open account ID, not its label; same ID limits. |

Synthetic example: `/erfassen?betrag=12%2C50&empfaenger=Beispielmarkt`.
For an income use `betrag=%2B12%2C50`. Use `URLSearchParams` in shortcuts to encode
spaces and `+` correctly. Invalid values are ignored individually; stale IDs are
ignored and the form uses its normal account/category defaults. Account/category IDs
can be read from the authenticated API (`/api/accounts`, `/api/categories`). Nothing
is fetched from a payment provider and a URL never confirms a booking automatically.

A login continuation accepts only this validated same-origin route. URLs can remain
in browser history and shortcut configuration; use fixed synthetic examples in docs
and keep personal shortcut values on the owner's device. No secrets belong in URLs.

The route can be used as the URL of a phone shortcut or home-screen button. The owner
creates that shortcut on the phone and chooses the actual account/category IDs there.

## Other device conveniences

- **Privatmodus:** header button and Einstellungen › Profil; `Strg Umschalt H`
  (`Cmd Umschalt H` on a Mac). Monetary displays, input visibility, chart axes and
  alternatives/tooltips follow one device preference (`budget-amounts-hidden`). It
  changes presentation only; domain values, drafts and exports retain their data.
- **Offline-Daten schützen:** after authentication, supported browsers receive one
  `navigator.storage.persist()` request per device/origin. The attempt is remembered
  in `budget-storage-persistence-requested`, including denial. Einstellungen ›
  Sicherheit reports the result. This protects local app files from browser eviction;
  it is not a backup or an offline booking queue. Blocked local storage retains a
  session guard only. Clearing site data resets both device preferences.
- **Noch ohne Kategorie:** Plan › Monat shows inflows, outflows and their signed net
  of uncategorized or pending splits, counted once. Only live budget-account money
  within the month and after the account's opening date counts; transfers are
  excluded. The links open uncategorized and pending bookings. This is explanatory:
  the stock-based Zu verteilen already includes these balances, so no second debit
  or change to envelope arithmetic is made.
- **Rest verteilen:** the button in each split line makes that active line equal to
  the total minus all other lines, including signed refund lines. Invalid amounts
  in another populated line leave the draft unchanged. The existing sum validation,
  save, audit and undo paths remain authoritative.
- **Braucht Aufmerksamkeit:** Today links to overspent envelopes, unfilled monthly
  category targets, dated savings goals with insufficient saved progress this month,
  the actual inbox count and upcoming outflows without cover. Adopted savings goals
  are counted through their envelope target once. Payments reserve category money
  in due order, separately per due month; received/missed occurrences are excluded.
  The strip disappears when no loaded item needs attention and always anchors to
  today's month even when Today displays a different pace month.

The capture category picker already displayed the booking month's available money,
including warning ink for negative amounts. This task retains that existing feature.
