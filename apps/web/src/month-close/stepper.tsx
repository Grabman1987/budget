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
  disabled = false,
  progress,
}: {
  steps: CloseStep[];
  current: number;
  onSelect: (step: number) => void;
  disabled?: boolean;
  progress?: { completedTasks: number; totalTasks: number };
}) {
  const tasks = steps.filter((s) => s.hasTasks);
  const total = progress?.totalTasks ?? tasks.length;
  const completed =
    progress?.completedTasks ??
    tasks.filter((s) => s.status === 'done' || s.status === 'skipped').length;
  return (
    <nav className="close-stepper" aria-label="Monatsabschluss">
      {total > 0 ? (
        <>
          <label htmlFor="close-progress">
            {completed} von {total} {total === 1 ? 'Schritt' : 'Schritten'} mit Aufgaben bearbeitet
          </label>
          <progress id="close-progress" max={total} value={completed} />
        </>
      ) : (
        <p role="status">Nichts offen. Prüfe das Ergebnis und merke den Stand.</p>
      )}
      <ol>
        {steps.map((s) => (
          <li key={s.step}>
            <button
              type="button"
              disabled={disabled}
              aria-current={s.step === current ? 'step' : undefined}
              onClick={() => onSelect(s.step)}
            >
              <span>
                {s.step}. {s.title}
              </span>
              <small>{s.step < 5 && !s.hasTasks ? '✓ nichts offen' : CLOSE_STATUS[s.status]}</small>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
