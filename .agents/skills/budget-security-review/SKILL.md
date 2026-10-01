---
name: budget-security-review
description: Task-scoped security and financial-integrity review for Budget's Hono, SQLite/Drizzle and passkey stack.
---

Use when changing auth, API mutations, migration, backup or external integrations. Local adaptation of the owner's vibe-security description; not a security certification or installed scanner.

- Review authorization and required step-up at the server boundary, session/cookie behavior and bounded input validation. Client-side checks never replace server checks.
- Check parameterized database access, strict CSP and the no-eval rule. Avoid leaking sensitive errors, credentials or private financial content through logs, fixtures, commits or tool output.
- Verify atomic mutation/audit behavior, rollback on invariant failures and undo/redo enforcement, including forced undo. Bulk, transfer, native trade and migration paths must obey the same affected invariants.
- Keep real exports and mappings in authorized private storage. Development and automated checks use synthetic data. Do not access or transmit private data beyond the owner's authorized task.
- For backup/deploy work, distinguish configured encryption/restore from a successful real restore; keep secrets in the designated secret store and verify actual workflow behavior.
- Record concrete findings with location, reproducible synthetic evidence, impact and minimal correction. Do not invent Supabase RLS requirements for this single-user SQLite app or present a task-scoped review as a complete security audit.
