import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  generateScaleTokensCss,
  generateTokensCss,
  parseColors,
  parseFontSizes,
  parseRadii,
  parseSpacing,
} from '../scripts/generate-tokens.mjs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const designMd = read('../../../DESIGN.md');
const tokensCss = read('./styles/tokens.css');
const scaleTokensCss = read('./styles/scale-tokens.css');
const scalesCss = read('./styles/scales.css');

describe('design tokens', () => {
  it('tokens.css is up to date with DESIGN.md (run `npm run tokens -w @budget/ui`)', () => {
    expect(tokensCss).toBe(generateTokensCss(designMd));
  });

  it('every colour of the DESIGN.md frontmatter appears in tokens.css', () => {
    const colors = parseColors(designMd);
    expect(Object.keys(colors).length).toBeGreaterThan(30);
    for (const [name, hex] of Object.entries(colors)) {
      if (['tint-2'].includes(name)) continue;
      if (name.startsWith('dark-') && name !== 'dark-primary-hover') {
        expect(tokensCss, name).toContain(`--${name.slice(5)}: ${hex};`);
      } else if (!name.startsWith('dark-')) {
        expect(tokensCss, name).toContain(`--${name}: ${hex};`);
      }
    }
  });

  it('defines light, system-dark, forced-dark and print blocks with the same roles', () => {
    expect(tokensCss).toContain(":root:not([data-theme='light'])");
    expect(tokensCss).toContain(":root[data-theme='dark']");
    expect(tokensCss).toContain('@media print');
    const bodies = [...tokensCss.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1] ?? '');
    const roleSets = bodies.map((b) => [...b.matchAll(/--([\w-]+):/g)].map((m) => m[1]).join(','));
    expect(roleSets).toHaveLength(4);
    expect(new Set(roleSets).size).toBe(1);
  });

  it('uses the pastel direction colours only as heat/good/bad roles', () => {
    expect(tokensCss).toContain('--heat-green: #a9dbb8;');
    expect(tokensCss).toContain('--heat-red: #f3b3a9;');
  });

  it('scale-tokens.css is up to date with DESIGN.md (run `npm run tokens -w @budget/ui`)', () => {
    expect(scaleTokensCss).toBe(generateScaleTokensCss(designMd));
  });

  it('every type size of DESIGN.md is a --fs-* token with the same value', () => {
    const sizes = parseFontSizes(designMd);
    expect(Object.keys(sizes)).toEqual([
      'dimension',
      'display',
      'headline',
      'title',
      'figure',
      'body',
      'label',
      'chart-label',
    ]);
    for (const [role, size] of Object.entries(sizes)) {
      expect(scaleTokensCss, role).toContain(`--fs-${role}: ${size};`);
    }
  });

  it('includes only the extra sizes already named in the DESIGN.md hierarchy', () => {
    expect(designMd).toContain('Klassen-Tags (11 px');
    expect(designMd).toContain('Ma\u00dftexte 13 px');
    expect(designMd).toContain(
      '34 px (Nettoverm\u00f6gen), 36 px (Panel) und 44 px (Buchungsdisplay',
    );
    for (const [role, size] of [
      ['class-tag', 11],
      ['chart-label-strong', 13],
      ['figure-large', 34],
      ['panel', 36],
      ['amount', 44],
    ]) {
      expect(scaleTokensCss).toContain('--fs-' + role + ': ' + size + 'px;');
    }
  });

  it('every radius of DESIGN.md is a --radius-* token with the same value', () => {
    const radii = parseRadii(designMd);
    expect(radii['sheet-mobile']).toBe('16px');
    expect(radii['sm']).toBe('6px');
    for (const [name, value] of Object.entries(radii)) {
      expect(scaleTokensCss, name).toContain(`--radius-${name}: ${value};`);
    }
  });

  it('every spacing step of DESIGN.md is a --space-* token (touch is --touch)', () => {
    const spacing = parseSpacing(designMd);
    expect(spacing['touch']).toBe('44px');
    for (const [name, value] of Object.entries(spacing)) {
      const token = name === 'touch' ? '--touch' : `--space-${name}`;
      expect(scaleTokensCss, name).toContain(`${token}: ${value};`);
    }
  });

  it('the mobile type scale overrides the desktop values inside the phone media query', () => {
    const phone = /@media \(max-width: 767px\) \{([\s\S]*)\}\s*$/.exec(scaleTokensCss)?.[1] ?? '';
    expect(phone).toContain('--fs-dimension: 40px;');
    expect(phone).toContain('--fs-body: 15px;');
  });

  it('the hand-written scales.css does not redefine generated scale tokens', () => {
    expect(scalesCss).not.toMatch(/--fs-[\w-]+:/);
    expect(scalesCss).not.toMatch(/--radius-[\w-]+:/);
    expect(scalesCss).not.toMatch(/--space-[\w-]+:/);
    expect(scalesCss).not.toMatch(/--touch:/);
  });

  it('Tailwind theme literals match the tokens of the same name', () => {
    const theme = read('./styles/tailwind-theme.css');
    const generated = `${scaleTokensCss}\n${scalesCss}`;
    for (const name of [
      '--font-ui',
      '--font-tech',
      '--radius-titleblock',
      '--radius-xs',
      '--radius-sm',
      '--radius-md',
      '--radius-sheet',
      '--radius-pill',
      '--ease-out',
    ]) {
      const pick = (css: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim();
      expect(pick(theme), name).toBe(pick(generated));
    }
  });
});
