import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script without types
import { generateTokensCss, parseColors } from '../scripts/generate-tokens.mjs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const designMd = read('../../../DESIGN.md');
const tokensCss = read('./styles/tokens.css');

describe('design tokens', () => {
  it('tokens.css is up to date with DESIGN.md (run `npm run tokens -w @budget/ui`)', () => {
    expect(tokensCss).toBe(generateTokensCss(designMd));
  });

  it('every colour of the DESIGN.md frontmatter appears in tokens.css', () => {
    const colors = parseColors(designMd) as Record<string, string>;
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

  it('Tailwind theme literals match the scale tokens of the same name', () => {
    const scales = read('./styles/scales.css');
    const theme = read('./styles/tailwind-theme.css');
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
      expect(pick(theme), name).toBe(pick(scales));
    }
  });
});
