import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../styles/components.css', import.meta.url), 'utf8');

/** Body of the first rule with exactly this selector (top level or inside a media block). */
const rule = (selector: string, from = 0): string => {
  const at = css.indexOf(`${selector} {`, from);
  if (at < 0) throw new Error(`rule ${selector} not found`);
  return css.slice(at, css.indexOf('}', at));
};

describe('amount operator buttons', () => {
  it('are 22 px as in the prototype on desktop', () => {
    expect(rule('.amount-ops')).toContain('repeat(2, 22px)');
  });

  it('become a 44 px row on the phone', () => {
    const media = css.indexOf('@media (max-width: 767px) {\n  .amount-input');
    expect(media).toBeGreaterThan(0);
    const phoneOps = rule('  .amount-ops', media);
    expect(phoneOps).toContain('grid-template-rows: var(--touch)');
  });
});
