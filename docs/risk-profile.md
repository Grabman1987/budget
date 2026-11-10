# Voluntary risk profile (v1)

Issue #812. Lives in the owner profile (Settings > Profil). All answers are optional; a missing
answer is stored as "no answer" and never defaults to a medium profile.

Two dimensions are classified separately:

- **Tolerance** (willingness to accept fluctuations): `lossReaction` (sell all / sell part / hold /
  buy more at -30 %) and `acceptableLoss` (up to 10 / 20 / 35 / 50 %). Scores 0..3 each; sum 0-2
  low, 3-4 medium, 5-6 high.
- **Capacity** (ability to bear losses): `horizon` (<3 / 3-7 / 7-15 / >15 years, 0..3),
  `liquidity` (likely need within 12 months: high / some / low, 0..2), `reserve` (<3 / 3-6 / >6
  months of expenses, 0..2), `income` (unstable / moderate / stable, 0..2). Sum 0-3 low, 4-6 medium,
  7-9 high. A horizon under 3 years or a high liquidity need caps capacity at low.

A dimension with any unanswered question is `unknown` (the result lists the open questions). Age,
household size and region are never inputs. `toleranceExceedsCapacity` flags tolerance above
capacity when both are known; it is a hint, not advice.

The classifier (`classifyRiskProfile`, `packages/domain/src/profile/risk.ts`) is pure and carries
`RISK_PROFILE_VERSION`. Any change of questions, scores or thresholds must bump the version.
Answers are stored as `app_setting` rows `profile.risk.<question>` through the profile save path
(validation, audit, Undo); no schema migration. Allocation targets, savings plans and bookings are
not touched.
