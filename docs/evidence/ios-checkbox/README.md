# Kontrollkästchen auf dem iPhone (synthetic data only)

Real WebKit, iPhone 13 profile (project `webkit-iphone`), seeded sample data, Konten › Alle Buchungen.
One booking is selected, the next one is not.

- `iphone-light.png`, `iphone-dark.png`: the checkbox is a 20 px rounded box with a drawn check mark.
  The input element itself stays a transparent 44 x 44 px hit area.

Regenerate with `CHECKBOX_EVIDENCE=1 npx playwright test e2e/checkbox-appearance.spec.ts --project=webkit-iphone`.
