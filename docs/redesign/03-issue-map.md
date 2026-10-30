# Phase C issue mapping

The owner approved the plan, Phase C and implementation in branches/PRs on 2026-10-30. Production merges, releases, activation and real-data changes still require separate owner OK. Protected contract/migration gates remain unchanged.

GitHub [Project 1](https://github.com/users/Grabman1987/projects/1) is the execution board. This file is the stable planning-ID-to-issue mapping, not a second status board. Existing parents/epics and completed work remain unchanged. No new aggregate/epic duplicates were created: the 50 planning IDs map to 56 bounded issue/PR boundaries after R3/E2 decomposition in section 7.1 of the [approved plan](01-umsetzungsplan.md). Seven later Moonshot slices remain undispatched.

Every issue carries the owned scope, inherited Must/Should/test/owner-preview criteria and section-6 common gates. Implementers must read both its child scope and the complete relevant plan section. Dependencies on R3 mean all four R3 children; dependencies on E2 mean all four E2 children.

| Planning/PR boundary | Issue                                                    | Depends on                                                                                                               |
| -------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| T0                   | [#819](https://github.com/Grabman1987/budget/issues/819) | Initial prerequisite                                                                                                     |
| T1                   | [#820](https://github.com/Grabman1987/budget/issues/820) | T0                                                                                                                       |
| T5                   | [#821](https://github.com/Grabman1987/budget/issues/821) | T1                                                                                                                       |
| S1                   | [#822](https://github.com/Grabman1987/budget/issues/822) | T1                                                                                                                       |
| T2                   | [#823](https://github.com/Grabman1987/budget/issues/823) | T1, S1                                                                                                                   |
| T3                   | [#824](https://github.com/Grabman1987/budget/issues/824) | T1, S1                                                                                                                   |
| T4                   | [#825](https://github.com/Grabman1987/budget/issues/825) | T1, S1                                                                                                                   |
| T6                   | [#826](https://github.com/Grabman1987/budget/issues/826) | T1, S1                                                                                                                   |
| T7                   | [#827](https://github.com/Grabman1987/budget/issues/827) | T1, S1                                                                                                                   |
| S2                   | [#828](https://github.com/Grabman1987/budget/issues/828) | S1, T1                                                                                                                   |
| S3                   | [#829](https://github.com/Grabman1987/budget/issues/829) | S1, S2, T6                                                                                                               |
| H1                   | [#830](https://github.com/Grabman1987/budget/issues/830) | S3, T2, T3, T4, T5                                                                                                       |
| H2                   | [#831](https://github.com/Grabman1987/budget/issues/831) | H1, T2, T3                                                                                                               |
| P1                   | [#832](https://github.com/Grabman1987/budget/issues/832) | H2, T4, S2                                                                                                               |
| P2                   | [#833](https://github.com/Grabman1987/budget/issues/833) | P1                                                                                                                       |
| P3                   | [#834](https://github.com/Grabman1987/budget/issues/834) | P1                                                                                                                       |
| P4                   | [#835](https://github.com/Grabman1987/budget/issues/835) | P1                                                                                                                       |
| P5                   | [#836](https://github.com/Grabman1987/budget/issues/836) | P2, P3, P4, T2                                                                                                           |
| P6                   | [#837](https://github.com/Grabman1987/budget/issues/837) | P1, P3, P4                                                                                                               |
| K1                   | [#838](https://github.com/Grabman1987/budget/issues/838) | P6, S3                                                                                                                   |
| K2                   | [#839](https://github.com/Grabman1987/budget/issues/839) | K1                                                                                                                       |
| K3                   | [#840](https://github.com/Grabman1987/budget/issues/840) | K2                                                                                                                       |
| K4                   | [#841](https://github.com/Grabman1987/budget/issues/841) | K3, S2                                                                                                                   |
| K5                   | [#842](https://github.com/Grabman1987/budget/issues/842) | K4                                                                                                                       |
| V1                   | [#843](https://github.com/Grabman1987/budget/issues/843) | K5, T3, T5                                                                                                               |
| V2                   | [#844](https://github.com/Grabman1987/budget/issues/844) | V1                                                                                                                       |
| V3                   | [#845](https://github.com/Grabman1987/budget/issues/845) | V2                                                                                                                       |
| V4                   | [#846](https://github.com/Grabman1987/budget/issues/846) | V3                                                                                                                       |
| E0                   | [#847](https://github.com/Grabman1987/budget/issues/847) | V4                                                                                                                       |
| R1                   | [#848](https://github.com/Grabman1987/budget/issues/848) | V4, E0, S3                                                                                                               |
| R2                   | [#849](https://github.com/Grabman1987/budget/issues/849) | R1                                                                                                                       |
| R4                   | [#850](https://github.com/Grabman1987/budget/issues/850) | R2, E0, K4                                                                                                               |
| R5                   | [#851](https://github.com/Grabman1987/budget/issues/851) | R2, T6                                                                                                                   |
| R6                   | [#852](https://github.com/Grabman1987/budget/issues/852) | R2                                                                                                                       |
| R8                   | [#853](https://github.com/Grabman1987/budget/issues/853) | R2, T4                                                                                                                   |
| R9                   | [#854](https://github.com/Grabman1987/budget/issues/854) | R2, K4                                                                                                                   |
| R10                  | [#855](https://github.com/Grabman1987/budget/issues/855) | R2                                                                                                                       |
| R11                  | [#856](https://github.com/Grabman1987/budget/issues/856) | R2, P1, P3                                                                                                               |
| E1                   | [#857](https://github.com/Grabman1987/budget/issues/857) | R11, E0                                                                                                                  |
| E3                   | [#858](https://github.com/Grabman1987/budget/issues/858) | E1, P1, R11                                                                                                              |
| E4                   | [#859](https://github.com/Grabman1987/budget/issues/859) | E1, K5                                                                                                                   |
| E5                   | [#860](https://github.com/Grabman1987/budget/issues/860) | E1, V3                                                                                                                   |
| E6                   | [#861](https://github.com/Grabman1987/budget/issues/861) | E1, S2                                                                                                                   |
| E7                   | [#862](https://github.com/Grabman1987/budget/issues/862) | E1, E6                                                                                                                   |
| R3a                  | [#863](https://github.com/Grabman1987/budget/issues/863) | R2, T3, T5, V4                                                                                                           |
| R3b                  | [#864](https://github.com/Grabman1987/budget/issues/864) | R3a                                                                                                                      |
| R3c                  | [#865](https://github.com/Grabman1987/budget/issues/865) | R3a                                                                                                                      |
| R3d                  | [#866](https://github.com/Grabman1987/budget/issues/866) | R3a, R3b, R3c                                                                                                            |
| R7                   | [#867](https://github.com/Grabman1987/budget/issues/867) | R2, R3a, R3b, R3c, R3d                                                                                                   |
| E2a                  | [#868](https://github.com/Grabman1987/budget/issues/868) | E1, E0, K2, R4                                                                                                           |
| E2b                  | [#869](https://github.com/Grabman1987/budget/issues/869) | E1, E0, R4                                                                                                               |
| E2c                  | [#870](https://github.com/Grabman1987/budget/issues/870) | E2b                                                                                                                      |
| E2d                  | [#871](https://github.com/Grabman1987/budget/issues/871) | E2b, E2c                                                                                                                 |
| Z1                   | [#872](https://github.com/Grabman1987/budget/issues/872) | E1, E2a, E2b, E2c, E2d, E3, E4, E5, E6, E7, R3a, R3b, R3c, R3d, R4, P6, K5, P2, P5, R1, R2, R5, R6, R7, R8, R9, R10, R11 |
| Z2                   | [#873](https://github.com/Grabman1987/budget/issues/873) | Z1                                                                                                                       |
| G1                   | [#874](https://github.com/Grabman1987/budget/issues/874) | Z1, Z2, T7                                                                                                               |

## Reconciliation boundaries

- Existing #508/#529 are reference/coordination parents, not substitutes for the new frozen redesign contract.
- #467/#469/#470/#477/#479/#482/#483/#485/#486/#487/#488/#489 and portfolio epics retain their original acceptance and any delivered children. These new issues own only the current approved redesign residue behind the new flag.
- #563/#741/#762/#818 remain separately owned work. K3/K5/V3 must check their current branches before touching the relevant saved-view, inbox, document or strategy writer. No second issue for those features was created.
- T0 is distinct from Windows/PDF #783; Finanz-Check recovery T6 is distinct from new score feature #814. Public onboarding #490 and profile/risk/pension extensions stay separate.
- T7 N1 display, E2 contact contracts/migrations, E7 encrypted-backup security and G1 production operations keep their specific gates. No balance correction, source enablement or protected-rule change is inferred.
- Issues remain open. No Live/queue:complete or owner/device acceptance is inferred from their creation or a planning PR.
