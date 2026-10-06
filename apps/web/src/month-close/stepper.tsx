import type { CloseStep } from '@budget/domain';

export const CLOSE_STATUS = {
  open: 'offen',
  done: 'erledigt',
  skipped: 'übersprungen mit Grund',
  following: 'folgt',
} as const;
export function CloseStepper({
  steps,
  current,
  onSelect,
}: {
  steps: CloseStep[];
  current: number;
  onSelect: (step: number) => void;
}) {
  const completed = steps.filter((s) => s.status === 'done' || s.status === 'skipped').length;
  return (
    <nav className="close-stepper" aria-label="Monatsabschluss">
      <label htmlFor="close-progress">{completed} von 5 Schritten bearbeitet</label>
      <progress id="close-progress" max={5} value={completed} />
      <ol>
        {steps.map((s) => (
          <li key={s.step}>
            <button
              type="button"
              aria-current={s.step === current ? 'step' : undefined}
              onClick={() => onSelect(s.step)}
            >
              <span>
                {s.step}. {s.title}
              </span>
              <small>{CLOSE_STATUS[s.status]}</small>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
