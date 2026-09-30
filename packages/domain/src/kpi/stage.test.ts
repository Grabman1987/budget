import { describe, expect, it } from 'vitest';
import { stageOf } from './stage';

describe('stageOf', () => {
  it('Fundament up to 10.000 €, with progress inside the stage', () => {
    expect(stageOf(0)).toMatchObject({
      stage: 1,
      key: 'fundament',
      progressBp: 0,
      remainingCents: 1_000_000,
    });
    expect(stageOf(250_000)).toMatchObject({ stage: 1, progressBp: 2500, remainingCents: 750_000 });
    expect(stageOf(999_999)).toMatchObject({ stage: 1, progressBp: 10_000 });
  });

  it('a limit belongs to the next stage', () => {
    expect(stageOf(1_000_000)).toMatchObject({
      stage: 2,
      key: 'aufbau',
      label: 'Aufbau',
      progressBp: 0,
    });
    expect(stageOf(5_500_000)).toMatchObject({
      stage: 2,
      progressBp: 5000,
      remainingCents: 4_500_000,
    });
    expect(stageOf(10_000_000)).toMatchObject({ stage: 3, key: 'freiheit', progressBp: 0 });
  });

  it('Freiheit up to 1 Mio. €, then it stays full', () => {
    expect(stageOf(50_000_000)).toMatchObject({ stage: 3, progressBp: 4444 });
    expect(stageOf(100_000_000)).toMatchObject({ stage: 3, progressBp: 10_000, remainingCents: 0 });
    expect(stageOf(250_000_000)).toMatchObject({ stage: 3, progressBp: 10_000, remainingCents: 0 });
  });

  it('negative net worth is Fundament with no progress', () => {
    expect(stageOf(-50_000)).toMatchObject({ stage: 1, progressBp: 0, remainingCents: 1_050_000 });
  });
});
