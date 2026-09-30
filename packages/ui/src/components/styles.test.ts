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

describe('registers', () => {
  it('do not hang the active underline over the clipping container (no negative margin)', () => {
    expect(rule('.registers a,\n.registers button')).not.toMatch(/margin-bottom:\s*-/);
    expect(rule('.registers')).toContain('overflow-x: auto');
    expect(rule('.registers')).not.toContain('border-bottom');
  });

  it('style the pressed state of the button variant', () => {
    expect(css).toContain(".registers button[aria-pressed='true']");
    expect(css).not.toContain(".registers button[aria-current='page']");
  });
});

describe('class fills', () => {
  const scales = readFileSync(new URL('../styles/scales.css', import.meta.url), 'utf8');

  it('--hatch-future is the same cross hatch as the SVG pattern (45° and 135°, 1.5 px on 5 px)', () => {
    const value = /--hatch-future:([^;]+);/.exec(scales)?.[1] ?? '';
    expect(value).toContain(
      'repeating-linear-gradient(45deg, var(--future) 0 1.5px, transparent 1.5px 5px)',
    );
    expect(value).toContain(
      'repeating-linear-gradient(135deg, var(--future) 0 1.5px, transparent 1.5px 5px)',
    );
  });
});
