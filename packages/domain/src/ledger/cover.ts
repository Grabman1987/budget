/** Cover targets in list order, spending positive sources largest first. Integer cents only. */
export function coverPlan(
  targets: readonly { id: string; overspentCents: number }[],
  sources: readonly { id: string | null; availableCents: number }[],
) {
  const pool = sources
    .filter((s) => s.availableCents > 0)
    .map((s) => ({ ...s }))
    .sort((a, b) => b.availableCents - a.availableCents);
  const moves: { fromId: string | null; toId: string; amountCents: number }[] = [];
  let coveredCount = 0;
  let missingCents = 0;
  for (const target of targets) {
    let left = target.overspentCents;
    for (const source of pool) {
      if (left <= 0) break;
      if (source.id === target.id) continue;
      const amountCents = Math.min(left, source.availableCents);
      if (amountCents <= 0) continue;
      moves.push({ fromId: source.id, toId: target.id, amountCents });
      source.availableCents -= amountCents;
      left -= amountCents;
    }
    if (left === 0) coveredCount++;
    missingCents += left;
  }
  return { moves, coveredCount, openCount: targets.length - coveredCount, missingCents };
}
