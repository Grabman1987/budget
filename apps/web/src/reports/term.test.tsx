// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Term } from './term';

it('links repeated terms to their own explanation without adding prose to report headers', () => {
  const { container } = render(
    <>
      <h2>
        <Term>TTWROR</Term>
      </h2>
      <h3>
        <Term>TTWROR</Term>
      </h3>
    </>,
  );
  const buttons = screen.getAllByRole('button', { name: 'TTWROR' });
  const ids = buttons.map((button) => button.getAttribute('aria-describedby'));
  expect(new Set(ids).size).toBe(2);
  for (const [index, id] of ids.entries()) {
    expect(buttons[index]?.getAttribute('popovertarget')).toBe(id);
    expect(document.getElementById(id!)?.textContent).toContain('Ein- und Auszahlungen');
  }
  expect(container.querySelector('h2')?.textContent).toBe('TTWROR');
});

it('keeps ordinary dynamic column headings as plain text', () => {
  render(<Term>Monat</Term>);
  expect(screen.getByText('Monat').textContent).toBe('Monat');
  expect(screen.queryByRole('button')).toBeNull();
});

it('preserves the accessible report heading name', () => {
  render(
    <h2>
      <Term>Sparquote</Term>
    </h2>,
  );
  expect(screen.getByRole('heading', { name: 'Sparquote' })).toBeTruthy();
});

it('keeps the explanation inside the report landmark but outside the heading', () => {
  const main = document.createElement('main');
  document.body.appendChild(main);
  render(
    <h2>
      <Term>TWR</Term>
    </h2>,
    { container: main },
  );
  const id = screen.getByRole('button', { name: 'TWR' }).getAttribute('aria-describedby')!;
  expect(document.getElementById(id)?.closest('main')).toBe(main);
  expect(main.querySelector('h2')?.textContent).toBe('TWR');
});
