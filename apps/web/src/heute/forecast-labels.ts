/** Five largest dated payment steps above 250 EUR; daily variable spending is not a payment. */
export function forecastStepLabels(
  days: ReadonlyArray<{ day: string; items: { cents: number; label?: string }[] }>,
) {
  return days
    .flatMap((d) =>
      d.items
        .filter((i) => Math.abs(i.cents) >= 25_000)
        .map((i) => ({ day: d.day, cents: i.cents, label: i.label ?? 'Geplante Zahlung' })),
    )
    .sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents) || a.day.localeCompare(b.day))
    .slice(0, 5)
    .sort((a, b) => a.day.localeCompare(b.day));
}
