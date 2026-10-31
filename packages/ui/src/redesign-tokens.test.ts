import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as generator from '../scripts/generate-tokens.mjs';

const design = readFileSync(new URL('../../../DESIGN.md', import.meta.url), 'utf8');
const generated = () => generator.generateRedesignTokensCss(design);
const roles = (css: string) =>
  [...css.matchAll(/\{([^{}]*)\}/g)].map((match) =>
    Object.fromEntries(
      [...match[1]!.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!]),
    ),
  );

function contrast(a: string, b: string) {
  const luminance = (hex: string) =>
    hex.match(/[a-f\d]{2}/gi)!.reduce((sum, channel, index) => {
      const value = parseInt(channel, 16) / 255;
      return (
        sum +
        [0.2126, 0.7152, 0.0722][index]! *
          (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
      );
    }, 0);
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe('S2 generated ON roles', () => {
  const light = {
    rule: '#d3deec',
    'rule-strong': '#6786ac',
    warning: '#8a5300',
    'warning-soft': '#fff3d6',
  };
  const dark = {
    rule: '#1f4d7c',
    'rule-strong': '#4987bc',
    warning: '#ffd37a',
    'warning-soft': '#473d2b',
  };

  it('maps the current source boundary and amber roles in light, system-dark, dark and print', () => {
    expect(roles(generated())).toEqual([light, dark, dark, light]);
  });

  it('derives a changed role from DESIGN rather than an embedded palette', () => {
    const changed = design.replace('warning: "#8a5300"', 'warning: "#704100"');
    const css = generator.generateRedesignTokensCss(changed);
    expect(roles(css)[0]?.warning).toBe('#704100');
  });

  it('fails closed when a required ON role is missing', () => {
    const incomplete = design.replace('  warning: "#8a5300"\n', '');
    expect(() => generator.generateRedesignTokensCss(incomplete)).toThrow(/warning/);
  });

  it('keeps the marker bridge gated and never replaces blue data/focus or field surfaces', () => {
    const css = generated();
    expect(css).toContain(":root:has([data-budget-redesign='1'])");
    expect(css).toContain(":root:not([data-theme='light']):has([data-budget-redesign='1'])");
    expect(css).toContain(":root[data-theme='dark']:has([data-budget-redesign='1'])");
    expect(css).toContain('@media print');
    for (const block of roles(css)) expect(Object.keys(block)).toEqual(Object.keys(light));
    expect(roles(css)).toHaveLength(4);
  });

  it('keeps both legacy generated files byte-identical for OFF', () => {
    for (const [file, sha256] of [
      ['tokens.css', '992d71738be65bc521339900feb1ebbf05c80096dd2d3dbdc49cc297fc99739d'],
      ['scale-tokens.css', '716d32f12bb1336a9e28a57ea07c2a30e6f2b5e72d6b9fff95e22ba9aa1426d0'],
    ] as const) {
      const bytes = readFileSync(new URL(`./styles/${file}`, import.meta.url));
      expect(createHash('sha256').update(bytes).digest('hex'), file).toBe(sha256);
    }
  });

  it('keeps the committed ON output current with the same generator', () => {
    expect(readFileSync(new URL('./styles/redesign-tokens.css', import.meta.url), 'utf8')).toBe(
      generated(),
    );
  });

  it('keeps amber text at AA contrast on normal and warning surfaces in both themes', () => {
    const blocks = roles(generated());
    expect(blocks).toHaveLength(4);
    for (const [index, block] of blocks.entries()) {
      const darkMode = index === 1 || index === 2;
      const colors = generator.parseColors(design);
      for (const role of ['ground', 'surface', 'surface-2']) {
        const background = colors[`${darkMode ? 'dark-' : ''}${role}`]!;
        expect(contrast(block.warning!, background), role).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(block.warning!, block['warning-soft']!)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
