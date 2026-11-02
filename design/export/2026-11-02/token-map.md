# Source token mapping and conflicts

Derived from source tokens.css, tokens.json, DESIGN-SYSTEM.md and DARK-MODE.md. Raw snapshots live in source/ and retain their source names and bytes for comparison only. The application generator still reads the authoritative root DESIGN.md; .impeccable/design.json and existing app tokens are preserved.

| Export role                       | Authoritative app role / treatment                                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| line                              | rule, quiet separators; never replace structural/data line globally                                                   |
| field                             | rule-strong, meaningful control boundary; never the field background                                                  |
| muted / subtle                    | ink-2 / ink-3; selected metadata uses ink-2                                                                           |
| ground / surface / soft / sidebar | ground / surface / surface-2 / ground-2; preserve current values                                                      |
| positive / negative               | plus-ink / minus-ink, signed direction with sign/arrow/zero axis                                                      |
| warning / warningsoft             | warning / warning-soft in the delivered isolated redesign adapter                                                     |
| red                               | action-needed/error/destructive only; historical negatives remain quiet signed ink                                    |
| good / good-soft                  | existing available-money roles with matching on-good/on-good-soft                                                     |
| data-mode=hell/dunkel             | existing root data-theme and system fallback; not a second theme engine                                               |
| status-ok / status-act aliases    | do not adopt raw aliases: derive a presentation mark from the existing status, using its semantic role plus icon/text |

## Conflicts retained as evidence, not applied

Source primary, ground, surface, sidebar and ink values differ from current generator inputs. Source --title stays blue even in dark mode; source --white is literal white. Source status-act points at signed orange although urgent actions require red, and source status-ok points at signed teal although target-met is blue/check. Do not use these aliases as an implementation contract.

Source radius-input is 6px while component forms specify 8px; source progress is 6px while root bars.progress is 4px. Root authoritative roles and component contracts win. Source fonts include Archivo Narrow; no new font/dependency is installed. Source minimum text claim conflicts with its 11px revision size and 11.5px tab labels. Preserve the approved generated T1–T12 scale and test readable, accessible controls in the actual affected UI rather than treating those prose claims as validation.

Source CSS has desktop font values but no phone scale media block; source JSON includes phone values. Use current generated responsive scale and 44px hit areas, not literal copy of either file. Source grid values do not authorize a grid wallpaper. Source dark selector, floating shadows, motion durations and chart dimensions are references; app theme selection, reduced motion, actual chart constraints and print rules remain authoritative.

The delivered S2 adapter already scopes redesign rules through the trusted build marker. This package changes no generated CSS, generator input, shared component or marker. Any future adoption needs a bounded owning slice and the existing OFF/ON checks.
