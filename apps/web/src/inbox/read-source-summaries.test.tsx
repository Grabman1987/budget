// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ReadSourceSummaries } from './read-source-summaries';

afterEach(cleanup);
it('shows one summary link per source, including a queue containing only movements', () => {
  render(
    <ReadSourceSummaries
      summaries={[
        { sourceId: 'crypto', name: 'Krypto-Lesequelle', count: 4200 },
        { sourceId: 'source-b', name: 'Lesequelle source-b', count: 2 },
      ]}
    />,
  );
  expect(screen.getAllByRole('link')).toHaveLength(2);
  expect(
    screen
      .getByRole('link', { name: 'Krypto-Lesequelle: 4200 Bewegungen zu prüfen' })
      .getAttribute('href'),
  ).toBe('/einstellungen/datenquellen#crypto-source-title');
  expect(
    screen.getByRole('link', { name: 'Lesequelle source-b: 2 Bewegungen zu prüfen' }),
  ).toBeTruthy();
});
