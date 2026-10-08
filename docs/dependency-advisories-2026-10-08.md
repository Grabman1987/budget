# Transitive dependency advisories — 2026-10-08

The lockfile contained `shell-quote` 1.9.0 through development dependency `concurrently` 9.2.4 and `source-map-js` 1.2.1 through the workspace toolchain. GitHub marks versions below 1.11.0 and 1.2.2 as affected, respectively: [GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv) and [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

The current `concurrently` release pins `shell-quote` 1.9.0 exactly. Available `concurrently` 9.x releases pin affected versions too, so a compatible lockfile-only update cannot select the patch. Root `package.json` therefore narrowly overrides only `concurrently`'s `shell-quote` dependency to 1.11.0. Remove the override after an upstream `concurrently` release pins a patched `shell-quote` version. No direct application dependency or Node version changed. `source-map-js` resolves to 1.2.2 within existing ranges.

## Verification

- `npm ci` completed from the updated lockfile; `npm ls concurrently shell-quote source-map-js --all` showed `concurrently@9.2.4` with `shell-quote@1.11.0` overridden and `source-map-js@1.2.2` in the installed toolchain.
- A quoted Node command completed through `concurrently`; a `source-map-js` generator/consumer round-trip returned the expected source position.
- Full `npm audit` reports 4 moderate, 0 high and 0 critical findings. The remaining findings are the existing `drizzle-kit` / `@esbuild-kit` / `esbuild` development chain; npm only offers a forced breaking `drizzle-kit@0.18.1` change. `npm audit --omit=dev` reports 0 vulnerabilities.
- `npm run check` passed with exit 0 using `VITEST_MAX_WORKERS=1` and `BUDGET_REQUIRE_AGE=1`: all workspace typechecks, lint and formatting passed; Vitest passed 370 files / 3,385 tests in 971.49 seconds. The local log is retained outside the repository.

Required final-head CI, main integration and actual deploy/health verification remain pending. The two patched package advisories and the bounded audit results do not establish complete application security acceptance.
