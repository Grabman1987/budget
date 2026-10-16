import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));

const revisionLabels = new Set([
  ":root[data-theme='dark'] .tb-revision",
  ":root[data-theme='dark'] .ps-revision",
]);

// DESIGN.md square bar/legend marks, never general UI exceptions.
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
  const fontTokens = new Set([...tokens.matchAll(/(--fs-[\w-]+):/g)].map((m) => m[1]));
  const sizes = (prefix) =>
    new Set(
      [...tokens.matchAll(new RegExp(`--${prefix}-[\\w-]+:\\s*([\\d.]+)px`, 'g'))].map((m) =>
        Number(m[1]),
      ),
    );
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
      const offset = block.index + block[0].indexOf('{') + 1 + declaration.index;
      const line = clean.slice(0, offset).split('\n').length;
      if (isFont) {
        // Native controls inherit the surrounding role; explicit sizes must use type tokens.
        if (value.trim() === 'inherit') continue;
        const token = /var\(--fs-[\w-]+\)/;
        const valid =
          [...value.matchAll(/var\((--fs-[\w-]+)\)/g)].every((m) => fontTokens.has(m[1])) &&
          (!value.includes('--fs-revision') || selectors.every((s) => revisionLabels.has(s))) &&
          (property === 'font-size'
            ? new RegExp(`^${token.source}\\s*(?:!important)?$`).test(value.trim())
            : /^(?:(?:normal|italic|oblique|small-caps|bold|bolder|lighter|[1-9]00)\s+)*var\(--fs-[\w-]+\)(?:\s*\/\s*(?:[\d.]+(?:px)?|var\(--lh-[\w-]+\)))?\s+/.test(
                value.trim(),
              ));
        if (!valid)
          violations.push(`${file}:${line} ${selectors.join(', ')}: ${property}: ${value.trim()}`);
        continue;
      }
      const pixels = [...value.matchAll(/(-?(?:\d*\.)?\d+)px\b/gi)];
      for (const pixel of pixels) {
        const size = Number(pixel[1]);
        if (radii.has(size)) continue;
        if (property === 'border-radius' && size === 1 && selectors.every((s) => chartMarks.has(s)))
          continue;
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
