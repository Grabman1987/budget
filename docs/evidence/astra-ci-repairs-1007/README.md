# Booking dialog CI repair — 2026-10-07

Synthetic Playwright captures at 390 × 844 pixels:

- [Light theme](phone-light.png)
- [Dark theme](phone-dark.png)

The booking sheet retains the shared 88dvh limit. Compact spacing keeps Mehr
visible without reducing the 44px controls. Both captures follow acceptance of
the single payee suggestion and its recent cash account.

The existing booking flow, both-theme axe checks, date actions, disclosure
preservation and panel height assertions remain unchanged in strength.
WebKit panel geometry is verified separately by `e2e/mobile-panels.spec.ts`.

The test runner used the Node tsx loader for sample seeding because this
environment does not permit the tsx CLI's Unix IPC socket. No acceptance checks,
servers, fixtures, retries or test timeouts were removed or relaxed.
