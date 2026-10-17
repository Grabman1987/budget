import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkCssScale, findScaleViolations } from '../scripts/check-css-scale.mjs';

const tokens = readFileSync(new URL('./styles/scale-tokens.css', import.meta.url), 'utf8');

describe('DESIGN.md CSS scale', () => {
  it('rejects off-ladder borders and reserves 2px for focus outlines and active registers', () => {
    expect(
      findScaleViolations(
        `.sample { border: 2px solid red; border-inline-width: 2.5px;
      border-top: 3px dashed blue; outline: 2px solid blue; border-width: medium; }
      .sample:focus-visible { border-width: 2px; outline-width: 3px; }`,
        'sample.css',
        tokens,
      ),
    ).toHaveLength(7);
  });

  it('accepts line tokens, thin borders, focus rings and the listed active register underline', () => {
    expect(
      findScaleViolations(
        `.sample { border: 0; border-width: 0 1px 1.5px;
      border-inline: var(--stroke-hairline) solid blue; }
      .sample:focus-visible { outline: 2px solid blue; outline-offset: 2px; }
      .registers a[aria-current='page'] { border-bottom: var(--stroke-active) solid blue; }`,
        'sample.css',
        tokens,
      ),
    ).toEqual([]);
  });
  it('rejects off-scale sizes, font shorthand and individual/compound corner radii', () => {
    const css = `.sample {
      font-size: 13px;
      font: 600 10.5px/1.4 sans-serif;
      border-radius: 0 7px 9px 14px;
      border-top-left-radius: 10px;
    }`;
    expect(findScaleViolations(css, 'sample.css', tokens)).toHaveLength(6);
  });

  it('rejects literal sizes even when their pixels match a scale step, and undefined tokens', () => {
    expect(
      findScaleViolations(
        '.sample { font-size: 14px; font: 600 12px/16px sans-serif; font-size: var(--fs-missing); }',
        'sample.css',
        tokens,
      ),
    ).toHaveLength(3);
  });

  it('accepts responsive type tokens, square corners and drafting geometry', () => {
    expect(
      findScaleViolations(
        `.sample { font-size: var(--fs-table); border-radius: 0px 8px / 12px;
        font: 600 var(--fs-label)/16px sans-serif; font: var(--fs-body) var(--font-ui);
        background-size: 7px 9px; stroke-width: 1px; }`,
        'sample.css',
        tokens,
      ),
    ).toEqual([]);
  });

  it('limits chart exceptions to exact selectors, properties and values', () => {
    expect(
      findScaleViolations(
        '.svg-label-strong { font-size: var(--fs-measure); } .sw { border-radius: 1px; }',
        'packages/ui/src/styles/charts.css',
        tokens,
      ),
    ).toEqual([]);
    expect(
      findScaleViolations(
        '.sample { font-size: 13px; border-radius: 1px; } .sw { border-radius: 7px; }',
        'sample.css',
        tokens,
      ),
    ).toHaveLength(3);
  });

  it('ignores comments but checks emoji sizing and adjacent text', () => {
    expect(
      findScaleViolations(
        '/* font-size: 9.5px; */ .sample .emoji { font-size: 19px; } .sample { font-size: 9.5px; }',
        'sample.css',
        tokens,
      ),
    ).toHaveLength(2);
  });

  it('reserves T12 for the documented dark Blatt/Rev selectors', () => {
    expect(
      findScaleViolations('.sample { font-size: var(--fs-revision); }', 'sample.css', tokens),
    ).toHaveLength(1);
    expect(
      findScaleViolations(
        ":root[data-theme='dark'] .tb-revision { font-size: var(--fs-revision); }",
        'sample.css',
        tokens,
      ),
    ).toEqual([]);
  });

  it('checks wealth typography like every other file', () => {
    const css = '.sample { font-size: 11px; border-radius: 7px; }';
    expect(findScaleViolations(css, 'apps/web/src/wealth/debts.css', tokens)).toHaveLength(2);
  });

  it('keeps every application and shared UI stylesheet on the design scale', () => {
    expect(checkCssScale()).toEqual([]);
  });
});
