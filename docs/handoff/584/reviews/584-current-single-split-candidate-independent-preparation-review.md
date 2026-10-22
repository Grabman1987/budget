# #584 outside current-source proof — preparatory independent review

Reviewed fresh public #584 OPEN and prerequisite #583 CLOSED on2026-10-21, complete candidate `49f2be66c19fd649034fd7a65c8591a87fd6578031b4c809547c72df0929e773` and plan `d501b808b0b9283ea46251f2c18e9e99a9c5a5474cc773823d53d70c00ceb0f7`. All ten pinned source/test references still match current50660fc4, although the proposal names historicalec5. No repository adoption, new branch, product edit, test/typecheck/browser execution or issue change by reviewer.

## Must fix before adoption/typecheck

Candidate uses `exact: true` on eight `getByRole` options (lines56,57,58,62,78,88,104,105). Installed `@testing-library/dom/types/queries.d.ts` defines ByRoleOptions with `name`, visibility/state filters etc., but no `exact`. These object literals will fail TypeScript excess-property checks. Remove only these role-option flags; string accessible names are already exact and default visibility filtering remains. `getByLabelText(...,{exact:true})` is supported and should remain. This is a NEW fixture-only correction, not a product defect.

## Source and oracle assessment

The fixture mounts real AmountInput/SplitEditor under real Query/Toast providers, normal user clear/paste and real category controls. Real existing exports `captureLines`, `buildCreate` and `emptyDraft` resolve. No absent future import, arithmetic replacement, broad transport mock or product-policy expansion is needed. Candidate CaptureForm-normalization expression matches actual lineDraft for new ordinary expense rows; the real CaptureForm itself is not mounted and its async account/date/write/Undo paths are not established here.

The expected literals are independent: total10,00→−1000; 3,34+6,66→1000; odd-cent334+333+333→1000; 334+333+332 leaves1cent. Actual captured model payload, order/category identity and absence of synthetic saves while invalid are checked, rather than computing expected values through the same mapper. Deleting line2 uses the real editor update path, then real captureLines replaces the sole retained line amount with unchanged gross total; final saved categoryA/−1000 proves normalization rather than the stale334 raw row. No product defect was found by source review; a later unchanged-source PASS would justify proof-only progress, not an invented implementation patch.

## Small coverage additions or explicit residual mapping

The two cases are meaningful presentation/model proof, not complete #584 acceptance. For a fully described literal unit proof, add an exact count of the amount-labelled inputs in the one-row states, and assert the existing explanatory nonzero-rest sentence as well as Rest0,01/disabled/no synthetic save. The issue also names Teilen; this proposal does not click it. Existing split-editor percent test already covers that distinct contact-share path (100,01 and33,33%→−6668/−3333) and unfinished-row guard; reference that result separately or add a bounded NEW interaction, without changing its financial meaning or requiring duplicate gross Betrag1 on a single shared category.

Synthetic saved observer establishes no real HTTP persistence, balances, lock behavior, write-side cents guards, Undo, privacy, native geometry or Axe. Issue requires actual desktop1440, Chromium390 and canonicalWebKitphone, both themes, exact posted/refetched splits, nonzero-rest noPOST/existing message, no horizontal overflow,44px/Axe and real Undo for actual writes exercised. Those are later explicit gates, not runtime or scope grants now. Existing styles/source are unchanged, so no new token/color/font-policy defect is introduced. #583 closure supersedes the old blocked-by text as a prerequisite fact but does not close #584.

**Disposition:** financial fixture direction CLEAR; NEW role-option typing correction required before source adoption/runtime. No present basis for a product patch or closure claim. Keep732LIVE/Root's later scope/runtime authorization as the sequencing boundary.
