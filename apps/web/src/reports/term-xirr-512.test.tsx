// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Term } from './term';

afterEach(cleanup);

it('explains XIRR with actual/365 and nonexclusive unavailable causes without changing the heading', () => {
  render(
    <main>
      <h2>
        <Term>XIRR</Term>
      </h2>
    </main>,
  );
  const trigger = screen.getByRole('button', { name: 'XIRR' });
  const text = document.getElementById(trigger.getAttribute('aria-describedby')!)?.textContent;
  expect(screen.getByRole('heading', { name: 'XIRR' }).textContent).toBe('XIRR');
  expect(text).toContain('Zeitpunkte');
  expect(text).toContain('actual/365');
  expect(text).toContain('nicht verfügbar');
  expect(text).toMatch(/nicht eindeutig|unbestimmt/);
  expect(text).not.toMatch(/immer.*unbestimmt|nur.*unbestimmt/);
  expect(text).not.toContain('Dietz');
});

it('retains generic MWR and gives repeated XIRR terms independent descriptions', () => {
  render(
    <main>
      <Term>MWR/IZF</Term>
      <Term>XIRR</Term>
      <Term>XIRR</Term>
      <Term>Monat</Term>
    </main>,
  );
  const mwr = screen.getByRole('button', { name: 'MWR/IZF' });
  expect(document.getElementById(mwr.getAttribute('aria-describedby')!)?.textContent).toContain(
    'Höhe und Zeitpunkte',
  );
  const irr = screen.getAllByRole('button', { name: 'XIRR' });
  expect(new Set(irr.map((element) => element.getAttribute('aria-describedby'))).size).toBe(2);
  expect(screen.queryByRole('button', { name: 'Monat' })).toBeNull();
});
