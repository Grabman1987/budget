import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { expect, it } from 'vitest';

/** A shared chart owns its image summary; child drawing nodes must not announce it again. */
function duplicateImages(text: string, file: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const matches: string[] = [];
  function visit(node: ts.Node, inside = false) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      if (['ChartSvg', 'ChartValue', 'ChartValues'].includes(opening.tagName.getText(source))) {
        inside = true;
      } else if (inside) {
        const role = opening.attributes.properties.find(
          (prop): prop is ts.JsxAttribute =>
            ts.isJsxAttribute(prop) && prop.name.getText(source) === 'role',
        );
        if (
          role?.initializer &&
          ts.isStringLiteral(role.initializer) &&
          role.initializer.text === 'img'
        ) {
          matches.push(`${file}:${source.getLineAndCharacterOfPosition(opening.pos).line + 1}`);
        }
      }
    }
    ts.forEachChild(node, (child) => visit(child, inside));
  }
  visit(source);
  return matches;
}

it('detects the duplicate image shape originally used by report bars', () => {
  expect(
    duplicateImages(
      '<ChartValue><div role="img" aria-label="Bedarf 50 %" /></ChartValue>',
      'bar.tsx',
    ),
  ).toEqual(['bar.tsx:1']);
  expect(duplicateImages('<div role="img" aria-label="Separate chart" />', 'bar.tsx')).toEqual([]);
});

it('keeps every production JSX chart caller free of a second native image summary', () => {
  const matches: string[] = [];
  function scan(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) scan(file);
      else if (file.endsWith('.tsx') && !file.endsWith('.test.tsx')) {
        const text = readFileSync(file, 'utf8');
        if (text.includes('<Chart')) matches.push(...duplicateImages(text, file));
      }
    }
  }
  scan(fileURLToPath(new URL('../', import.meta.url)));
  expect(matches).toEqual([]);
});
