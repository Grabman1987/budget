# Portfolio retry isolation (#702)

The unchanged desktop portfolio positions scenario failed in PR691 CI39254530110
at line215 on both configured attempts: after seeing the retry action and removing
route interception, its click waited until the original30-second scenario timeout.
The recovery PR changed only its standalone script, workflow and evidence. No
production retry defect or benchmark calculation regression is established.

## Proven mechanism and bounded change

AccountTree enables the same positions query after its accounts arrive. An enabled
transition can fetch again after an earlier error. Removing the synthetic failure
before that transition lets automatic recovery remove the retry action before the
scenario clicks it. The page and sidebar query factories and React Query defaults
remain unchanged.

The coordinator adds only a sidebar accounts attachment assertion and two actual
rendering frames before the existing retry-visible assertion. This lets the rendered
accounts and passive observer update settle before the failure is removed. It adds
no fixed sleep, timeout extension, retry, production policy or different financial
expectation. DOM attachment alone was refined after independent review identified
the passive useEffect boundary.

| Existing file | Coordinator-owned change | Authority and preserved coverage |
| --- | --- | --- |
| e2e/portfolio-positions.spec.ts | Nine-line accounts/render readiness block | Owner test-change policy permits stricter isolation with per-file justification and independent review. All original actions, mock payloads, assertions, financial expectations, timeouts and configured retries are retained byte-for-byte. |

Removing that exact block restores original SHA256
`4012d8c47bd4db958b7c827e50826cc1baa6b1eb9a4acf5b0eff6b4909db13f8`.
The patched file SHA256 is
`225e650e3f8ebc8877148b8741b91098f59807a48ad78b31e918c38f0d5bf8a4`.
No product file, existing API/financial test, manifest, lockfile or configuration changes.

## Independent evidence

An independent real QueryClient/QueryObserver control imports the unchanged production
query factories. A late sidebar observer recovers automatically when failure is removed;
a pre-enrolled observer stays in error until explicit refetch returns literal8800000.

A separate controlled actual WebKit27.2 browser at1440x900 passed:

1. Hold the accounts response until the first positions503 and visible error. Remove
   the failure, then release accounts: positions200 removes Retry and shows88,000EUR
   without a user click.
2. In the revised order, release accounts while the synthetic503 remains, execute
   the exact new barrier and original retry-visible assertion. A synchronous diagnostic
   counter observes both completed503 responses before route removal; it adds no wait.
3. Execute the original retry click and every remaining unknown-quote, missing-FX basis,
   product-detail, back-navigation and empty-state assertion. All pass unchanged.

The bounded proof used the already-built isolated #697 app read-only; relevant AccountTree,
PortfolioPage, query factory and server wealth source hashes match main297a574c.
Only disposable local synthetic databases/auth were used. No production data or secrets.
This is a real controlled WebKit diagnostic, not canonical Chromium CI acceptance or
proof of the precise historical CI timing; its trace artifact could not be retrieved.

Independent whole-diff review is CLEAR. At immutable current-main candidate
`5377807469d061173502b36364db68f90aa3d617`, the age-required full check passed all
501 files / 4,477 tests (two workers), and the normal production build passed;
both exited 0. Both frozen file hashes and the candidate commit stayed unchanged.
Logs: `702-full-check.log` and `702-full-production-build.log` in the coordinator's
external validation log directory. Only this results paragraph changed afterward.
Final exact-head canonical CI, serial integration and live verification remain
required; no issue closure is claimed from the controlled diagnostic or local check.
