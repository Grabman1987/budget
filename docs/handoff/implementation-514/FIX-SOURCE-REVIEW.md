# #514 successful-write refresh correction — source review

Reviewed `ce7c59df2ad5c962b80cd2236cc7ffb502c21113` versus `e7566feb0835c697531556651d213e5ef669cad4` in `/workspace/impl-514-targets`. Source-only; no tests, checks, build, browser or runtime validation.

The prior P2 is resolved in this narrow delta. `useBudgetWrite` now catches only the canonical `run()` rejection as write failure; a later query-refresh rejection returns `false` from `refreshView`, retains the confirmed result and displays a success receipt with a refresh caveat and the same Undo action. Thus `SelectedFunding` closes on a committed apply rather than showing its false “not applied” message. Undo and redo also distinguish completed audit actions from subsequent refresh failures. The selected-funding writer, preview ticket, amount calculation and migration are untouched. No new finding in this correction delta. This does not prove runtime Undo behavior or database atomicity.
