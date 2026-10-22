# #489 production flag — bounded correction review

Reviewed exact head `0154ab19c9cf10030acc67283cfa41c91a0397df` against `8a534c8de543ba2e8c72a264c3c8dec2a357577d` in `/workspace/impl-489-overview-design`. Scope: the `apps/server/src/app.ts` correction, surrounding middleware and route definitions, and two documentation changes. Source reading only; no HTTP requests, tests/checks, build, browser, CI, deployment or repository edits.

**Source-clear for both previously reported P2 findings. No additional actionable finding in this exact delta.**

- The canonical enabled GET/HEAD gallery branch now awaits downstream middleware in `try/finally` and sets `Cache-Control: no-store` after it returns. This overrides the SPA fallback's `no-cache` on the final response and also covers early owner-session denial and downstream error responses. The existing session gate still precedes static/SPA handling; default-off behavior and missing-auth startup refusal remain intact.
- After the existing four-pass decode loop, any remaining percent character returns 404/no-store before static or SPA handling. The previously reported deeply encoded `/dev` alias therefore cannot fall through. The exact raw-path GET/HEAD allowlist is unchanged, and other developer paths remain refused.
- The added rejection acts on URL pathname only; query values are unaffected. Normal fixed routes, identifiers without nested escape syntax, hashed asset paths, and ordinarily percent-encoded characters that fully decode within the bound do not reach the new rejection. No existing route inspected requires four-level residual percent encoding. The conservative rejection of unresolved path escapes is intentional. Existing malformed-percent rejection already preceded this fix.
- Documentation accurately archives the earlier findings and describes a source-only correction; it makes no executed HTTP validation claim.

This closes the two source findings, not runtime acceptance. Existing broader review limits and #719 STOP remain unchanged. No flag was activated.
