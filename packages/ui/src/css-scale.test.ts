import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkCssScale, findScaleViolations } from '../scripts/check-css-scale.mjs';

const tokens = readFileSync(new URL('./styles/scale-tokens.css', import.meta.url), 'utf8');

describe('DESIGN.md CSS scale', () => {
  it('rejects off-scale sizes, font shorthand and individual/compound corner radii', () => {
    const css = `.sample {
      font-size: 13px;
      font: 600 10.5px/1.4 sans-serif;
      border-radius: 0 7px 9px 14px;
      border-top-left-radius: 10px;
    }`;
    expect(findScaleViolations(css, 'sample.css', tokens)).toHaveLength(6);
  });

  it('accepts scale literals, responsive tokens, square corners and drafting geometry', () => {
    expect(
      findScaleViolations(
        `.sample { font-size: 14px; border-radius: 0px 8px / 12px;
        font: 600 14px/19px sans-serif; font: var(--fs-body) var(--font-ui); font-size: .5em;
        background-size: 7px 9px; stroke-width: 1px; }`,
        'sample.css',
        tokens,
      ),
    ).toEqual([]);
  });

  it('limits chart exceptions to exact selectors, properties and values', () => {
    expect(
      findScaleViolations(
        '.svg-label-strong { font-size: 13px; } .sw { border-radius: 1px; }',
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

  it('ignores comments and emoji glyph sizing, but checks adjacent text', () => {
    expect(
      findScaleViolations(
        '/* font-size: 9.5px; */ .sample .emoji { font-size: 19px; } .sample { font-size: 9.5px; }',
        'sample.css',
        tokens,
      ),
    ).toHaveLength(1);
  });

  it('keeps every application and shared UI stylesheet on the design scale', () => {
    expect(checkCssScale()).toEqual([]);
  });
});
