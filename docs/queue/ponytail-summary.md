# Ponytail summary (core rules)

Source: the Ponytail skill. Applies to code changes; `SPEC.md` and [`../queue/README.md`](README.md) govern product invariants and delivery policy.

1. Ladder, stop at the first rung that holds: needed at all? already in this codebase? stdlib? native platform feature? already-installed dependency? one line? only then the minimum code.
2. Read and understand the task and the code it touches first; the ladder shortens the solution, never the reading.
3. Bug fix = root cause where all callers route through, not a symptom patch in one caller.
4. No unrequested abstractions, interfaces with one implementation, config for constants, or scaffolding for later.
5. Deletion over addition; boring over clever; fewest files; shortest diff once the problem is understood.
6. Mark deliberate shortcuts with a known ceiling as `ponytail: <ceiling and upgrade path>`.
7. Never simplify away validation at trust boundaries, error handling that prevents data loss, security, or accessibility.
8. Money paths keep their invariants (integer cents, shared domain functions, no float arithmetic).
9. Use suitable existing checks for acceptance criteria; do not add tests merely to satisfy this summary. Follow `docs/queue/README.md` for test edits, targeted local checks, required CI and independent review. For calculations, preserve financial expectations and follow `SPEC.md`.
