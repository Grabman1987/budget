# #564/#565 reconciliation source checkpoint — NOT VALIDATED

Pinned base: `9542344c3619783cd854846182bd5eab79c7bbdc` from the completed
`codex/impl-heute-month-close` source branch. Its #601 grouped confirmation,
retained close revision, existing category guard and audited reconciliation stay.
No changes to the local #758/#760 branches or inbox task page.

Owner direction: implementation only. No tests were written/edited/run; no
checks, typechecks, builds, browser validation, CI, PR, merge or deployment.
Source progress does not establish acceptance or live completion.

- #564 already had exact same-day/payee/signed-amount duplicate hints and bounded
  pending subset suggestions. These matching rules remain; split-transfer parents
  are excluded from duplicate deletion hints to avoid counterpart effects.
- The preview now exposes all actual pending candidates. The UI lists these and
  every existing duplicate hint before offering a correction. Nothing is inferred
  to be bank-confirmed merely because its amount matches. Candidate actions reuse
  ordinary booking patch/delete/edit handlers and their audit/Undo. Ignore is an
  explicit local review choice, bound to that account/date/balance/candidate state.
  A changed preview withdraws the old review choice. The opaque review fingerprint
  includes booking/account state and the audit head. For an adjustment, the client
  sends the displayed candidate revision and the repo compares it with a fresh
  preview inside the write transaction before any mutation. A missing/invalid
  revision is refused; a stale revision conflicts without posting a different
  residual. Month close retains its independent source-revision CAS.
- Corrections appear only after the candidates are resolved or explicitly ignored
  and a difference remains. At zero difference, the ordinary final reconciliation
  stamps and locks bookings without creating a correction. Exact explaining
  month-close actions still confirm/delete + reconcile in one existing group.
  Other explicit candidate writes invalidate the retained close context and require
  an explicit reload; they never silently advance its source revision.
- #565 uses the existing no-category posting with the owner label “Zu verteilen”.
  The last category from a successful correction is saved per account in existing
  audited `app_setting`, in the same transaction/group as correction + locks + check.
  No migration, unaudited browser preference, new financial category or income type.
  Undo restores the prior preference as well as the correction/check. Cancelled
  forms and checks with no correction do not rewrite the remembered choice.
- Only live, visible permitted spending categories in a live group are offered.
  Deleted, hidden or otherwise ineligible remembered choices fall back to
  Zu verteilen. An invalid explicitly submitted category is rejected before the
  correction is created. The actual amount remains the canonical residual
  `statement − cleared`; cent, date, lock and rollback semantics are unchanged.
- New candidate payee/memo display text passes through the existing money-text
  privacy mask. The stored names, notes, candidate revision and editable drafts
  retain their exact source values.

Changed source: reconciliation repo, ledger DTO/model/flow and scoped reconcile.css;
the bounded review fix also changes the reconciliation request DTO and Zod API body.
No database schema/migration or financial formula changes. The existing preview API
still spreads the repo DTO. Preference keys use hashed account identities to remain
within app_setting's existing 64-character key constraint.

Deferred proof/adapters: existing reconciliation preview mocks need actual
`pendingCandidates`, `candidateRevision`, active `adjustmentCategories`, and remembered choice fields;
old selectors describing an immediate correction/old “Ohne Kategorie” label need
technical adaptation. Adjustment request fixtures must include the shown revision;
stale and missing revisions must preserve the old balance and audit group. Preserve
all literal money/status/lock/audit/Undo assertions.
Meaningful later proof: duplicate before adjustment, explicit pending actions,
zero-residual reconciliation, correction/lock/preference grouped Undo and rollback,
account isolation, deleted/hidden category fallback, concurrent invalidation,
and privacy with a money string embedded in a candidate name/memo.
Desktop1440, Chromium390, WebKit iPhone, light/dark, keyboard/focus/Axe/44px/overflow,
required checks and independent final-diff review remain open.

Workflow source inspection: push CI is restricted to main; other relevant workflows
run on PR/manual triggers. Only an ordinary WIP checkpoint push is intended.

The independent source review of the first package head (`e04b3002d5b843f6de35f3bbf98c2e3c1d506674`)
is archived in `RECONCILE-564-565-SOURCE-REVIEW.md`; its two findings motivated
the bounded source correction above. An independent final-delta review is still
required. This checkpoint is not runtime-validated or live.
