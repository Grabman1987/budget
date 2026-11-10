# Voluntary family situation and obligations (v1)

Issue #813. Lives in the owner profile (Settings > Profil) next to the risk profile (#812). Every
field is optional; "not given" (`null`) is distinct from an explicit "none" and from `0`, and is
never replaced by an assumption.

Fields (stored as `app_setting` rows `profile.family.<field>` through the profile save path:
validation, audit, Undo, client conflict check; no schema migration):

- `partnership`: `none` | `partner`.
- `partnerIncome`: `none` | `partial` | `full`; only meaningful with a partner (the form clears it
  when the partnership changes away from `partner`).
- `dependants`: 0..10 financially dependent persons, children included.
- `children`: 0..10, of which children; never more than `dependants` (rejected with 422; a
  contradictory stored value reads as not given).
- `support`: `none` | `some`: recurring support payments to persons outside the household.

Not collected: names or dates of birth of other persons, and any amounts. Household size stays in
`Profile.household` and is not duplicated; support amounts belong to the existing payments and
budget lines, so nothing is counted twice and no expense is derived from household composition.

`describeFamilyContext` (`packages/domain/src/profile/family.ts`) is pure and versioned
(`FAMILY_SITUATION_VERSION`). It only explains the relation to liquidity need and risk-bearing
capacity: `review` when dependants, support obligations or a sole income are reported, `nothing`
when everything relevant is given and none applies, otherwise `unknown`, with the list of missing
facts. It produces no score, penalty, recommendation, reserve or target change, and it is not an
input of the risk classifier or of any existing calculation. Any change of the rule bumps the
version.

PATCH `/api/profile` semantics: `family` is a partial object (omitted field = unchanged, `null` =
clear); an empty `family` object is rejected with 400.
