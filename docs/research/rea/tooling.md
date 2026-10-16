# Tool verification and investigation limits

Verified on 2026-10-15. These are fresh observations for this research, not conclusions copied from the installation chat.

## Live REA verification

The connected `mcp__rea.binary_session({})` call succeeded. It reported:

| Property | Observed value |
| --- | --- |
| Package / running server | `rea-agents` / `rea`, version `6.5.0` |
| MCP protocol | `2025-06-18` |
| Skill | `reverse-engineer-anything`, expected version `42`; installed instructions read from the personal agent skill directory |
| Catalog | 207 MCP tools, 153 CLI commands, 6 prompts |
| Catalog SHA-256 | `405725e736ec8dc8483435b970acbf20f9f26b9f1fd25203b992f5ab4cd2a4f4` |
| Current native/archive target | None (`open: false`) |
| Progress / cancellation | Supported |

This verifies connection, tool discovery and a real session response. It does not prove that every advertised operation is supported on this host or for every target.

## Available and missing capabilities

- Static JavaScript/artifact and managed-code operations are advertised. REA is useful for shipped application packages and controlled browser observations; ordinary source repositories are inspected directly with Git and text tools, following the skill's routing rule.
- Ghidra is not configured (`GHIDRA_INSTALL_DIR` absent); no native decompilation claim is made.
- Hopper is unsupported on this Windows host. IDA is not configured. macOS-only inspection operations are unavailable.
- Browser target discovery requires a caller-selected loopback Chrome DevTools endpoint. An authenticated endpoint is not established by successful MCP setup.
- The initial browser-control inventory attempt timed out and returned no usable tab inventory. After the owner supplied an authenticated Codex-browser tab, a direct binding succeeded. Ten privacy-safe, read-only surface observations are recorded in the [YNAB supplement](ynab.md#authenticated-read-only-observation-ledger). The Codex-browser connection is not a caller-provided CDP endpoint for REA.

No extra analysis engine, Java runtime or commercial software is needed merely to document public source repositories. None is installed by this research task.

## Privacy and read-only boundaries

The supplied YNAB budget is investigated only through regular authorized read access. Do not record its private URL identifier, account/category/payee names, values, tokens, network payloads or screenshots in the repository. Public product documentation and synthetic examples provide the reusable specification evidence. Login or an inaccessible browser is recorded as a gap; no authentication restriction is bypassed.

For a REA browser scenario use URL-only capture, no storage snapshot, no request/response bodies, no header values and no screenshots for the private budget. Public source manifests may record public URLs and immutable commits. Do not claim a private runtime observation from a public documentation page or from a fresh logged-out browser.

## Evidence interpretation

REA's session identity is a tooling observation, not a product-function Evidence record. Any later product-level REA result must retain its actual Evidence ID, provider, limitations and scope in the relevant product's source ledger. If the applicable operation is unavailable, record that limitation and use official documentation/source without relabelling it as REA evidence.

Local source inspection confirms code and test definitions. Tests are described as present unless this research actually runs them. Financial/device/production gates in existing acceptance documents remain open until their independent evidence is supplied.

See the [working plan](README.md), [project baseline](project-baseline.md) and [progress log](progress.md).
