import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./overview.css', import.meta.url), 'utf8');

/** Body of the last `@media (max-width: 767px)` block that mentions `needle`. */
function phoneBlock(needle: string) {
  const blocks = css.split('@media (max-width: 767px) {').slice(1);
  const hit = blocks.filter((block) => block.includes(needle)).at(-1);
  expect(hit, needle).toBeDefined();
  return hit!;
}

describe('Heute phone layout (#1065)', () => {
  const ON_GATE = ":root:has([data-budget-redesign='1'])";
  const marker = css.indexOf('/* Phone period row (ON only), variant B');
  const variantB = css.slice(css.indexOf('@media', marker));

  it('gates every variant B selector on the redesign build (the OFF build stays as on main)', () => {
    const selectors = [...variantB.matchAll(/^\s*([^{}@/*\n][^{}]*?)\s*\{/gm)].map((m) => m[1]!);
    expect(selectors.length).toBeGreaterThan(15);
    for (const selector of selectors)
      for (const part of selector.split(','))
        expect(part.trim().startsWith(ON_GATE), part).toBe(true);
  });

  it('sets the month label in the body size, above the tab labels, without !important', () => {
    expect(variantB).toMatch(/\.month-name \{[^}]*font-size: var\(--fs-body\)/);
    expect(variantB).toMatch(/\.seg-slide button \{[^}]*font-size: var\(--fs-meta\)/);
    expect(variantB).not.toContain('!important');
  });

  it('draws the stepper without a box and the row on one hairline with a 2px active line', () => {
    expect(variantB).toMatch(/\.month-switch \{[^}]*border: 0[^}]*box-shadow: none/);
    expect(variantB).toMatch(
      /\.hv-head-phone \{[^}]*border-bottom: var\(--stroke-hairline\) solid var\(--rule\)/,
    );
    expect(variantB).toMatch(/\.hv-head-phone \{[^}]*background: var\(--ground\)/);
    expect(variantB).toMatch(/\[aria-pressed='true'\]::after \{[^}]*height: 2px/);
  });

  it('keeps 44px boxes on 32px rows and stacks the row only when it cannot fit', () => {
    expect(variantB).toMatch(/\.icon-btn \{[^}]*height: 44px;[^}]*margin-block: -6px/);
    expect(variantB).toMatch(/\.seg-slide button \{[^}]*height: 44px;[^}]*margin-block: -6px/);
    expect(variantB).toMatch(/max-width: 374px\) \{[^}]*flex-basis: 100%/);
    expect(variantB).toMatch(/max-width: 429px\) \{[^}]*:has\(\.month-now\)[^}]*flex-basis: 100%/);
  });

  it('turns the task table into two-line rows for the whole phone range, not only below 400px', () => {
    expect(css).not.toMatch(/max-width: 399px\) \{\s*\.hv-revisions/);
    const block = phoneBlock('.hv-revisions tbody tr');
    expect(block).toMatch(/grid-template-columns: 30px minmax\(0, 1fr\) auto/);
  });

  it('clears the floating action button with the shared tab bar and FAB tokens', () => {
    const block = phoneBlock('.sheet:has(> .heute-screen)');
    expect(block).toContain('var(--tabbar-h) + var(--fab-gap) + var(--fab-size)');
  });
});
