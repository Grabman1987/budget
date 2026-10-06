// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { InflationExplorer } from './inflation-explorer';

afterEach(cleanup);
it('keeps interpretation with the owner even with an empty selection', () => {
  render(
    <InflationExplorer
      categories={[{ id: 'example', name: 'Beispiel', inclusion: 'always', included: true }]}
      rows={[]}
    />,
  );
  const checkbox = screen.getByRole('checkbox', { name: 'Beispiel' });
  expect((checkbox as HTMLInputElement).checked).toBe(true);
  fireEvent.click(checkbox);
  expect(screen.getByText('Bitte mindestens eine Kategorie auswählen.')).toBeTruthy();
  expect(
    screen.getByText(
      'Mehr Fahrten erhöhen die Treibstoffkosten, nicht den Preis – Mengeneffekte selbst einordnen.',
    ),
  ).toBeTruthy();
});
