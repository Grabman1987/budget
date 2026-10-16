// Generates from DESIGN.md (single source of truth):
//   src/styles/tokens.css        colours (light, dark, print) plus the roles DESIGN.md names in prose
//   src/styles/scale-tokens.css  type scale (--fs-*), radii (--radius-*), spacing (--space-*, --touch)
// Run: npm run tokens -w @budget/ui   (the unit tests fail when a committed file is stale)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

/** Read `key: "value"` pairs of the frontmatter block `colors:`. */
export function parseColors(designMd) {
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(designMd)?.[1] ?? '';
  const block = /^colors:\n((?: {2}.+\n?)+)/m.exec(frontmatter)?.[1] ?? '';
  const colors = {};
  for (const line of block.split('\n')) {
    const m = /^ {2}([\w-]+): "(#[0-9a-fA-F]{6})"/.exec(line);
    if (m) colors[m[1]] = m[2].toLowerCase();
  }
  return colors;
}

/** Frontmatter block `name:` as its lines (two-space indented). */
function frontmatterBlock(designMd, name) {
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(designMd)?.[1] ?? '';
  return new RegExp(`^${name}:\\n((?: {2}.*\\n?)+)`, 'm').exec(frontmatter)?.[1] ?? '';
}

/** Flat `key: "value"` pairs of a frontmatter block, e.g. `rounded:` or `spacing:`. */
function parseFlat(designMd, name) {
  const out = {};
  for (const line of frontmatterBlock(designMd, name).split('\n')) {
    const m = /^ {2}([\w-]+): "([^"]+)"/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

export const parseRadii = (designMd) => parseFlat(designMd, 'rounded');
export const parseSpacing = (designMd) => parseFlat(designMd, 'spacing');

/** `fontSize` of every `typography:` role, in file order. */
function parseTypographyProperty(designMd, property) {
  const out = {};
  let role = null;
  for (const line of frontmatterBlock(designMd, 'typography').split('\n')) {
    const r = /^ {2}([\w-]+):\s*$/.exec(line);
    if (r) role = r[1];
    const size = new RegExp(`^ {4}${property}: "([^"]+)"`).exec(line);
    if (size && role) out[role] = size[1];
  }
  return out;
}

export const parseFontSizes = (designMd) => parseTypographyProperty(designMd, 'fontSize');

// Roles that DESIGN.md names in prose only (tints, scrim, shadow, direction colours, dark hover).
const EXTRA = {
  light: {
    'red-soft': 'rgba(196, 42, 31, 0.08)',
    tint: 'rgba(23, 71, 166, 0.06)',
    'tint-2': 'rgba(23, 71, 166, 0.11)',
    overlay: 'rgba(11, 27, 51, 0.32)',
    shadow: '0 10px 22px -10px rgba(11, 27, 51, 0.30), 0 2px 5px rgba(11, 27, 51, 0.08)',
    'heat-red': '#f3b3a9',
    'heat-green': '#a9dbb8',
    'good-ink': 'var(--plus-ink)',
    'bad-ink': 'var(--minus-ink)',
    'heat-max': '80%',
    'on-red': '#ffffff',
    'card-border': 'rgba(15, 34, 64, 0.08)',
    'card-shadow':
      '0 1px 2px rgba(15, 34, 64, 0.04), 0 4px 12px -4px rgba(15, 34, 64, 0.06), 0 18px 36px -24px rgba(15, 34, 64, 0.16)',
    'grid-line': 'rgba(23, 71, 166, 0.075)',
  },
  dark: {
    'primary-hover': '#ffffff',
    'red-soft': 'rgba(255, 139, 123, 0.12)',
    tint: 'rgba(210, 236, 255, 0.07)',
    'tint-2': 'rgba(210, 236, 255, 0.13)',
    overlay: 'rgba(4, 14, 32, 0.55)',
    shadow: '0 12px 24px -10px rgba(2, 10, 26, 0.7), 0 2px 6px rgba(2, 10, 26, 0.4)',
    'heat-red': '#b8665d',
    'heat-green': '#4f9a6c',
    'good-ink': 'var(--plus-ink)',
    'bad-ink': 'var(--minus-ink)',
    'heat-max': '50%',
    'on-red': '#1a0d0b',
    'card-border': 'rgba(210, 236, 255, 0.1)',
    'card-shadow': '0 1px 2px rgba(2, 10, 26, 0.35), 0 10px 26px -14px rgba(2, 10, 26, 0.6)',
    'grid-line': 'rgba(210, 236, 255, 0.07)',
  },
};

/** Role order in the output; every role must exist for light and dark. */
const ROLES = [
  'ground',
  'ground-2',
  'raised',
  'surface',
  'surface-2',
  'card-border',
  'card-shadow',
  'grid-line',
  'ink',
  'ink-2',
  'ink-3',
  'line',
  'line-2',
  'rule',
  'rule-strong',
  'graticule',
  'primary',
  'primary-hover',
  'on-primary',
  'red',
  'red-soft',
  'on-red',
  'good',
  'good-hover',
  'on-good',
  'good-soft',
  'on-good-soft',
  'quiet-soft',
  'need',
  'want',
  'future',
  'tint',
  'tint-2',
  'overlay',
  'shadow',
  'heat-red',
  'heat-green',
  'plus-ink',
  'minus-ink',
  'good-ink',
  'bad-ink',
  'heat-max',
];

function modeValues(colors, mode) {
  const values = {};
  for (const role of ROLES) {
    const fromDesign = mode === 'dark' ? colors[`dark-${role}`] : colors[role];
    const value =
      fromDesign ?? EXTRA[mode][role] ?? (mode === 'dark' ? undefined : EXTRA.light[role]);
    if (value === undefined) throw new Error(`Token "${role}" (${mode}) is missing in DESIGN.md`);
    values[role] = value;
  }
  return values;
}

const declarations = (values, indent) =>
  ROLES.map((role) => `${indent}--${role}: ${values[role]};`).join('\n');

export function generateTokensCss(designMd) {
  const colors = parseColors(designMd);
  const light = modeValues(colors, 'light');
  const dark = modeValues(colors, 'dark');
  return `/* GENERATED by scripts/generate-tokens.mjs from DESIGN.md. Do not edit by hand. */

/* Light: blue ink on white drafting film. */
:root,
:root[data-theme='light'] {
  color-scheme: light;
${declarations(light, '  ')}
}

/* Dark: classic blueprint. Follows the system unless a theme is forced with data-theme. */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    color-scheme: dark;
${declarations(dark, '    ')}
  }
}

:root[data-theme='dark'] {
  color-scheme: dark;
${declarations(dark, '  ')}
}

/* Print always uses the light tokens (the doubled specificity beats the theme selectors). */
@media print {
  :root:not(#_),
  :root[data-theme]:not(#_) {
    color-scheme: light;
${declarations(light, '    ')}
  }
}
`;
}

export function generateScaleTokensCss(designMd) {
  const typeTokens = (mobile = false) =>
    ['fontSize', 'lineHeight'].flatMap((property) =>
      Object.entries(parseTypographyProperty(designMd, property + (mobile ? 'Mobile' : ''))).map(
        ([role, value]) => [`--${property === 'fontSize' ? 'fs' : 'lh'}-${role}`, value],
      ),
    );
  const radii = parseRadii(designMd);
  const spacing = parseSpacing(designMd);
  const lines = (entries, indent) => entries.map(([k, v]) => `${indent}${k}: ${v};`).join('\n');
  return `/* GENERATED by scripts/generate-tokens.mjs from DESIGN.md. Do not edit by hand. */

/* Mode-independent tokens: type scale, radii, spacing. */
:root {
  /* Type scale (phone overrides below) */
${lines(typeTokens(), '  ')}

  /* Radii */
${lines(
  Object.entries(radii).map(([k, v]) => [`--radius-${k}`, v]),
  '  ',
)}

  /* Spacing */
${lines(
  Object.entries(spacing).map(([k, v]) => [k === 'touch' ? '--touch' : `--space-${k}`, v]),
  '  ',
)}
}

@media (max-width: 767px) {
  :root {
${lines(typeTokens(true), '    ')}
  }
}
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const designMd = readFileSync(here('../../../DESIGN.md'), 'utf8');
  writeFileSync(here('../src/styles/tokens.css'), generateTokensCss(designMd));
  writeFileSync(here('../src/styles/scale-tokens.css'), generateScaleTokensCss(designMd));
  console.log('Wrote packages/ui/src/styles/tokens.css and scale-tokens.css');
}
