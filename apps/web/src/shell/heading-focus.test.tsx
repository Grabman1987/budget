// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

afterEach(() => document.head.querySelectorAll('style').forEach((style) => style.remove()));

it('keeps programmatic route headings focused without a ring', () => {
  const style = document.createElement('style');
  style.textContent =
    readFileSync('packages/ui/src/styles/base.css', 'utf8') +
    readFileSync('apps/web/src/shell/shell.css', 'utf8');
  render(
    <main className="sheet">
      <h2 tabIndex={-1}>Kategorie</h2>
      <button>Bearbeiten</button>
    </main>,
  );
  const heading = screen.getByRole('heading');
  heading.focus({ preventScroll: true });
  document.head.append(style);
  expect(document.activeElement).toBe(heading);
  expect(getComputedStyle(heading).outline).toBe('none');
});
