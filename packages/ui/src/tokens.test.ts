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

const linearRgb = (hex: string) =>
  hex.match(/[a-f\d]{2}/gi)!.map((v) => {
    const s = parseInt(v, 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
const luminance = (rgb: number[]) =>
  rgb.reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i]!, 0);

// Machado et al. (2009), severity 1.0, applied to linear sRGB and clipped to gamut.
// https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html
function simulateCvd(rgb: number[], type: 'deuteranopia' | 'protanopia') {
  const matrix =
    type === 'deuteranopia'
      ? [
          [0.367322, 0.860646, -0.227968],
          [0.280085, 0.672501, 0.047413],
          [-0.01182, 0.04294, 0.968881],
        ]
      : [
          [0.152286, 1.052583, -0.204868],
          [0.114503, 0.786281, 0.099216],
          [-0.003882, -0.048116, 1.051998],
        ];
  return matrix.map((row) =>
    Math.max(
      0,
      Math.min(
        1,
        row.reduce((sum, v, i) => sum + v * rgb[i]!, 0),
      ),
    ),
  );
}

// Linear sRGB -> XYZ (D65) -> CIELAB; Euclidean distance is CIE Delta E 1976.
function lab(rgb: number[]) {
  const xyz = [
    [0.4124564, 0.3575761, 0.1804375],
    [0.2126729, 0.7151522, 0.072175],
    [0.0193339, 0.119192, 0.9503041],
  ];
  const [x, y, z] = xyz.map((row, i) => {
    const t = row.reduce((sum, v, j) => sum + v * rgb[j]!, 0) / [0.95047, 1, 1.08883][i]!;
    return t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29;
  });
  return [116 * y! - 16, 500 * (x! - y!), 200 * (y! - z!)];
}

describe('design tokens', () => {
  it('uses linear-light simulation and D65 CIELAB reference values', () => {
    const red = simulateCvd([1, 0, 0], 'protanopia');
    expect(red).toEqual([0.152286, 0.114503, 0]);
    const white = lab([1, 1, 1]);
    expect(white[0]).toBeCloseTo(100, 3);
    expect(white[1]).toBeCloseTo(0, 3);
    expect(white[2]).toBeCloseTo(0, 3);
    expect(lab([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('keeps signed inks at 4.5:1 on normal surfaces in every theme and print', () => {
    for (const block of tokensCss.matchAll(/\{([^{}]*)\}/g)) {
      const token = (name: string) => new RegExp(`--${name}:\\s*([^;]+);`).exec(block[1]!)?.[1];
      const dark = block[1]!.includes('color-scheme: dark');
      for (const [role, color] of [
        ['plus-ink', dark ? '#4fe3d0' : '#0b7285'],
        ['minus-ink', dark ? '#ff9d7a' : '#b8380a'],
      ]) {
        expect(token(role!), role).toBe(color);
        const ink = luminance(linearRgb(token(role!)!));
        for (const surface of ['ground', 'ground-2', 'raised', 'surface', 'surface-2']) {
          const background = luminance(linearRgb(token(surface)!));
          expect(
            (Math.max(ink, background) + 0.05) / (Math.min(ink, background) + 0.05),
            `${role} on ${surface}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(token('good-ink')).toBe('var(--plus-ink)');
      expect(token('bad-ink')).toBe('var(--minus-ink)');
    }
  });

  // The retired red/green pair reached only Delta E 7-18 under simulation (UX audit D-03). The
  // owner's exact teal/orange (decision 1A) reaches >= 29; 25 keeps a margin and, together with
  // the mandatory sign/arrow channel, stays clearly distinguishable.
  it.each(['deuteranopia', 'protanopia'] as const)(
    'keeps plus/minus CIE Delta E >= 25 under %s',
    (type) => {
      for (const block of tokensCss.matchAll(/\{([^{}]*)\}/g)) {
        const token = (name: string) => new RegExp(`--${name}:\\s*([^;]+);`).exec(block[1]!)?.[1];
        expect(token('plus-ink')).toBeDefined();
        expect(token('minus-ink')).toBeDefined();
        const plus = lab(simulateCvd(linearRgb(token('plus-ink')!), type));
        const minus = lab(simulateCvd(linearRgb(token('minus-ink')!), type));
        expect(
          Math.hypot(...plus.map((v, i) => v - minus[i]!)),
          `${type}: ${token('plus-ink')} / ${token('minus-ink')}`,
        ).toBeGreaterThanOrEqual(25);
      }
    },
  );

  it('keeps saturated heatmap extremes readable in light, dark and print', () => {
    const rgb = (hex: string) => hex.match(/[a-f\d]{2}/gi)!.map((v) => parseInt(v, 16));
    const luminance = (color: number[]) =>
      color.reduce((sum, value, i) => {
        const s = value / 255;
        return (
          sum +
          (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][i]!
        );
      }, 0);
    for (const block of [...tokensCss.matchAll(/\{([^{}]*)\}/g)]) {
      const token = (name: string) => new RegExp(`--${name}:\\s*([^;]+);`).exec(block[1]!)![1]!;
      const max = parseFloat(token('heat-max')) / 100;
      const ink = luminance(rgb(token('ink')));
      const ground = rgb(token('ground'));
      for (const hue of ['heat-green', 'heat-red']) {
        const color = rgb(token(hue));
        const strongest = color.map((v, i) => v * max + ground[i]! * (1 - max));
        expect(Math.hypot(...strongest.map((v, i) => v - ground[i]!))).toBeGreaterThanOrEqual(60);
        for (const base of ['ground', 'surface']) {
          const background = rgb(token(base));
          const mixed = luminance(color.map((v, i) => v * max + background[i]! * (1 - max)));
          expect(
            (Math.max(ink, mixed) + 0.05) / (Math.min(ink, mixed) + 0.05),
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

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
    expect(tokensCss).toContain(":root[data-theme='light']");
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
