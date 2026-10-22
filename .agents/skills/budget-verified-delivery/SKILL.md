---
name: budget-verified-delivery
description: Deliver small independently reviewed Budget changes with meaningful evidence and the authorized serial integration process.
---

Use [`docs/queue/README.md`](../../../docs/queue/README.md) as the single source for coordination, test policy, verification, review, blockers and delivery. This skill adds implementation guidance only.

1. Read `SPEC.md` and the current task. State a bounded acceptance case and respect product, privacy, integer-cent and shared-calculation rules.
2. Prefer a small direct fix. Preserve intentional placeholders and current feature scope.
3. For financial defects, establish the expected result independently of the implementation. Cover relevant mutation, undo and rollback behavior without duplicating the production formula in a test.
4. When delegation is authorized, scope each assignment by owned files, acceptance criteria and dependencies. In a shared checkout, have one writer per file or migration sequence. Limit concurrency and require a completion freeze as described in the queue README. Review the full final diff before delivery.
5. Run affected tests and static checks during implementation. Reuse suitable existing checks for acceptance criteria; do not add tests just to satisfy a documentation rule. Existing tests may receive authorized technical UI/API adaptations, with brief per-file rationale and independent review; preserve protected expectations. Follow the queue README for the checks needed before PR and merge.
6. Open a reviewable PR when suitable targeted checks pass. Integrate and deploy only through the queue README's authorized serial workflow and existing required gates. Verify actual publication and report the revision.
7. Record concrete acceptance gaps and data or network blockers. Do not claim completion based only on test totals or partial guards.
