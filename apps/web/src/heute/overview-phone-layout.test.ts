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
  it('sets the month label in the body size, above the tab labels', () => {
    const block = phoneBlock('.hv-head-phone .month-switch .month-name');
    expect(block).toMatch(/\.month-name \{[^}]*font-size: var\(--fs-body\)/);
    expect(block).toMatch(/\.seg-slide button \{[^}]*font-size: var\(--fs-meta\) !important/);
  });

  it('draws the stepper without a box and the tabs on a hairline baseline with a 2px active line', () => {
    const block = phoneBlock('.hv-head-phone .seg.seg.seg-slide');
    expect(block).toMatch(/\.month-switch \{[^}]*border: 0[^}]*box-shadow: none/);
    expect(block).toMatch(
      /\.seg\.seg\.seg-slide \{[^}]*border-bottom: var\(--stroke-hairline\) solid var\(--rule\)/,
    );
    expect(block).toMatch(/\[aria-pressed='true'\]::after \{[^}]*height: 2px/);
  });

  it('keeps 44px boxes on 32px rows, with a row gap that stops them overlapping', () => {
    const block = phoneBlock('.hv-head-phone .seg.seg.seg-slide');
    expect(block).toMatch(/\.icon-btn \{[^}]*height: 44px;[^}]*margin-block: -6px/);
    expect(block).toMatch(/\.seg-slide button \{[^}]*height: 44px;[^}]*margin-block: -6px/);
    expect(block).toMatch(/\.hv-head-phone \{[^}]*gap: 12px/);
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
