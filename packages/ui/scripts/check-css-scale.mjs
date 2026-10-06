import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));

// DESIGN.md chart lettering and square bar/legend marks, never general UI exceptions.
const chartLabels = new Set([
  '.svg-label-strong',
  '.svg-label-line',
  '.svg-label-red',
  '.preview-chart text',
]);
const chartMarks = new Set([
  '.sw',
  '.plan .sb-bar',
  '.plan .rail-fill',
  '.plan .ptable .pbar',
  '.kutil .pbar',
  '.lg-sq',
  '.vb-bar',
  '.vb-bar i',
  '.ov-shares-rest',
  '.mr-sw',
  '.rf-sq',
  '.rf-sw',
  '.sr-track',
  '.sr-track i',
  '.sr-bl-track',
  '.sr-bl-track i.sr-bl-ist',
  '.sr-523-bar',
  '.sr-stack',
  '.sr-use-bar',
  '.sr-use-bar i',
  '.sr-pp',
  '.sr-pp i',
]);

export function findScaleViolations(css, file, tokens) {
  const sizes = (prefix) =>
    new Set(
      [...tokens.matchAll(new RegExp(`--${prefix}-[\\w-]+:\\s*([\\d.]+)px`, 'g'))].map((m) =>
        Number(m[1]),
      ),
    );
  // 13px is chart-only; ordinary body copy uses the normal scale.
  const fonts = new Set([...sizes('fs')].filter((size) => size !== 13));
  const radii = new Set([0, ...sizes('radius')]);
  const violations = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
  for (const block of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = block[1]
      .trim()
      .split(',')
      .map((s) => s.trim());
    for (const declaration of block[2].matchAll(
      /(?:^|;)\s*(font-size|font|border(?:-[\w-]+)?-radius)\s*:\s*([^;]+)/g,
    )) {
      const [, property, value] = declaration;
      const isFont = property === 'font' || property === 'font-size';
      const pixels = [...value.matchAll(/(-?(?:\d*\.)?\d+)px\b/gi)];
      for (const pixel of property === 'font' ? pixels.slice(0, 1) : pixels) {
        const size = Number(pixel[1]);
        if ((isFont ? fonts : radii).has(size)) continue;
        if (isFont && selectors.every((s) => /\.emoji$/.test(s))) continue;
        if (isFont && size === 13 && selectors.every((s) => chartLabels.has(s))) continue;
        if (property === 'border-radius' && size === 1 && selectors.every((s) => chartMarks.has(s)))
          continue;
        const offset = block.index + block[0].indexOf('{') + 1 + declaration.index;
        const line = clean.slice(0, offset).split('\n').length;
        violations.push(`${file}:${line} ${selectors.join(', ')}: ${property}: ${pixel[0]}`);
      }
    }
  }
  return violations;
}

export function checkCssScale() {
  const tokens = readFileSync(resolve(root, 'packages/ui/src/styles/scale-tokens.css'), 'utf8');
  const violations = [];
  for (const directory of ['apps/web/src', 'packages/ui/src']) {
    for (const file of readdirSync(resolve(root, directory), { recursive: true })) {
      if (!file.endsWith('.css')) continue;
      const relative = `${directory}/${file.replaceAll('\\', '/')}`;
      violations.push(
        ...findScaleViolations(readFileSync(resolve(root, relative), 'utf8'), relative, tokens),
      );
    }
  }
  return violations;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = checkCssScale();
  if (violations.length) {
    console.error(violations.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('CSS typography and radii match the DESIGN.md scale.');
  }
}
