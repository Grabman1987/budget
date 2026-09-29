---
version: 1
slug: "prototype-vermoegen-html"
primary_target: "design/prototype/vermoegen.html"
related_targets: []
---

# Vermögen

Scope: page "Vermögen" with registers Nettovermögen, Portfolio, Schulden, Freiheitszahl. Desktop and mobile, inside the established blueprint world (DESIGN.md). Static prototype `design/prototype/vermoegen.html`. Visitor mode: Operate.

Audience and job: the single household user. "Was besitze ich?" Understand how net worth grows and why (own contribution vs market), whether the money is allocated right (Soll/Ist, R13–R15), when the loan is paid off and what a special repayment saves, and how far financial freedom is.

Content: same sample figures as Heute and Konten (net worth 84.730 €, invested 88.000 €, debts 12.626 €). Portfolio: ETF Welt, ETF Schwellenländer, one single stock, Bitcoin, Ethereum, P2P; allocation Soll 80/12/8 with the speculative share over its limit (consistent with Heute's Finanz-Check). Loan 6,32 % with monthly rate 412 € and a special-repayment scenario (300 € from Plan stage 6).

Constraints: period switch 1M · 3M · YTD · 1J · 3J · Alles in the title block for all figures; line = level over time, bars around zero = change per period; benchmark as dash-dot; debts as dashed outline, never hatched; red only for action needed (rebalancing breach); tabular figures; no real ISINs, names or providers.

Decision note: no structural concept round (user asked to continue directly). Structure follows concept chapter 7.4.

## Direction contract

THESIS: Vermögen explains itself as dimensions: net worth is start plus own contribution plus market, allocation is actual against a tolerance band, the loan end is a date that moves when you pay more. Refuses the broker-app look of green/red tickers and donut walls.

OWN-WORLD: DESIGN.md blueprint unchanged: title block with period switch, registers, dimension chains, parts lists, ISO line types (solid actual, dashed forecast and scenario, dash-dot benchmark), elevation mark only in charts, revision table for rebalancing actions, arithmetic input for scenarios. New here: tolerance band as a light ink band behind the Soll mark; bars around zero for own contribution and market.

STORY: The user sees net worth and where the growth came from, checks the allocation and gets one or two rebalancing revisions, plays with the special repayment and sees the payoff date and interest saved move, and reads how many years financial freedom is away.

FIRST VIEWPORT: Desktop 1440: title block (Vermögen, Stand, period switch), registers; net worth figure with its chain (Anfang + Eigenleistung + Markt = jetzt) beside the composition; the net worth line with monthly bars around zero below it. Mobile 390: same order, charts full width.

FORM: Parts-list and dimension-chain grammar from Plan and Konten, no new roll. Signature interaction: the special-repayment field recomputes the payoff date, the saved interest and the dashed scenario line live.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
