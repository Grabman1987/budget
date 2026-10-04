import { expect, it } from 'vitest';
import { allocationStatus } from './allocation';
import { savingsPlanProposal } from './proposals';

it('steers conserved whole-plan rates using mixed weights without pausing their underweight sleeve', () => {
  const allocation = allocationStatus(
    [
      { id: 'over', kind: 'etf', assetClass: 'a', valueCents: 7000 },
      { id: 'under', kind: 'etf', assetClass: 'b', valueCents: 3000 },
    ],
    [
      { assetClass: 'a', targetBp: 5000 },
      { assetClass: 'b', targetBp: 5000 },
    ],
  );
  const proposal = savingsPlanProposal(
    [
      { id: 'single', name: 'Einzelklasse', kind: 'etf', assetClass: 'a', monthlyCents: 1000 },
      {
        id: 'mixed',
        name: 'Mischprodukt',
        kind: 'etf',
        assetClass: null,
        monthlyCents: 1000,
        exposures: [
          { assetClassId: 'a', weightBp: 6000 },
          { assetClassId: 'b', weightBp: 4000 },
        ],
      },
    ],
    allocation,
    { speculativeBreached: false, stepCents: 1 },
  );
  expect(proposal.plans.map((p) => [p.id, p.proposedCents, p.reason])).toEqual([
    ['single', 0, 'paused_r13_over'],
    ['mixed', 2000, 'steer_r13_under'],
  ]);
  expect(proposal.totalCents).toBe(2000);
  expect(proposal.plans.reduce((a, p) => a + p.proposedCents, 0)).toBe(2000);
});
