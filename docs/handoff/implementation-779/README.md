# PR 779 TypeScript compatibility refresh

This updates the existing PR 779 branch after main absorbed PR 778. The direct update places TypeScript 7.0.2 at the `typescript` package name, outside the locked `typescript-eslint@8.72.0` peer range `>=4.8.4 <6.1.0`. Earlier PR CI failed at `npm ci` with `ERESOLVE`, before compilation.

[Microsoft's TypeScript 7 release guidance](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) recommends two npm aliases during the transition. Root `typescript` now resolves `@typescript/typescript6@6.0.2`, whose `@typescript/old` dependency resolves TypeScript 6.0.3. This retains the JavaScript compiler API for `typescript-eslint` and `apps/web/src/reports/chart-accessibility-555.test.ts`. Root `@typescript/native` resolves TypeScript 7.0.2 and supplies `tsc` for the existing workspace typecheck scripts. The `~7.0.2` range retains the PR's 7.0.x scope; all other dependency versions are unchanged from the prepared head. The package metadata checked under Node 22.23.3 shows npm-registry tarball URLs and TypeScript 7's existing optional platform packages.

Preparation only: Node 22.23.3 / npm 10.9.9 `npm install --package-lock-only --ignore-scripts --no-audit --no-fund` resolved without `ERESOLVE`; `git diff --check` passed. This command did not install dependencies or run project code. None of the three TypeScript alias targets declares a lifecycle install hook in registry metadata or a lockfile `hasInstallScript` marker; TypeScript 6 has ordinary project scripts that npm does not run on install. The lockfile also gained npm-generated `peer` markers on existing optional Rolldown and Lightning CSS platform entries; their versions and tarball URLs did not change.

## Runtime and local comparison

At source `fb1e1d2ee1f825438a2ec11b6c7cce45cf8c40c5`, a fresh isolated Windows x64 checkout passed `npm ci --no-audit --no-fund` under Node 22.23.3 / npm 10.9.9 after checkout and source validation. The project install-script policy was retained. The checkout remained clean. Actual CLI banners reported native `tsc` 7.0.2 and `tsc6` 6.0.3; a native Node ESM import exposed the 6.0.3 `createProgram` and `createSourceFile` APIs. The existing `chart-accessibility-555.test.ts` passed all three tests using that installation.

One serialized local web typecheck pair used the same checkout, dependency graph, `apps/web/tsconfig.json` and `--noEmit` flags, in TypeScript 6 then TypeScript 7 order:

| Compiler | Version | Wall time | Exit code |
| --- | --- | --- | --- |
| TypeScript 6 | 6.0.3 | 97.4 s | 0 |
| Native TypeScript 7 | 7.0.2 | 10.3 s | 0 |

The exploratory wall-time ratio is 9.5. This is one local pair with that run order; cache and host effects were not controlled through repeated trials. The result covers this web typecheck, while full delivery time and memory remain unmeasured. No strictness, financial expectation or test timeout was changed.

Reproduce the compiler commands after the clean install with Node 22.23.3:

```text
node node_modules/typescript/bin/tsc6 -p apps/web/tsconfig.json --noEmit
node node_modules/@typescript/native/bin/tsc -p apps/web/tsconfig.json --noEmit
```

The full source diff has independent review. All-workspace Linux and Windows checks, lint, build, the remaining required exact-head PR CI and publication are still pending. The local results do not establish completion of those gates. Documentation-only follow-ups reuse the runtime evidence only while the tested manifest, lockfile and application source remain unchanged.
