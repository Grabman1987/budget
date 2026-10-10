// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { router } from '../router';

const validate = router.routesByPath['/reports/$reportId']!.options.validateSearch as (
  search: Record<string, unknown>,
) => Record<string, unknown>;

it('retains the selected report cell and expanded groups across a direct reload', () => {
  expect(
    validate({ zelle: 'cat:synthetic-food', spalte: '2024-02', gruppen: ['synthetic-needs'] }),
  ).toMatchObject({ zelle: 'cat:synthetic-food', spalte: '2024-02', gruppen: ['synthetic-needs'] });
  expect(validate({ zelle: 'net', spalte: 'summe' })).toMatchObject({
    zelle: 'net',
    spalte: 'summe',
  });
});

it('retains a payslip detail identity independently of the edit form', () => {
  expect(validate({ zettel: 'synthetic-slip', gehaltszettel: 'neu' })).toMatchObject({
    zettel: 'synthetic-slip',
    gehaltszettel: 'neu',
  });
});

it('drops malformed or unbounded detail selectors', () => {
  const search = validate({
    zelle: 'unknown',
    spalte: '2024-13',
    zettel: 'x'.repeat(65),
    gruppen: ['x'.repeat(65), 3],
  });
  expect(search['zelle']).toBeUndefined();
  expect(search['spalte']).toBeUndefined();
  expect(search['zettel']).toBeUndefined();
  expect(search['gruppen']).toEqual([]);
});
