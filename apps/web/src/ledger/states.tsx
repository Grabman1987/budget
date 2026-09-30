import { Button } from '@budget/ui';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { errorText } from './labels';

/** Loading: a quiet line, announced politely; no spinner theatre. */
export function LoadingNote({ what }: { what: string }) {
  return (
    <p className="rev-empty" role="status" aria-busy="true">
      <Loader2 className="icon spin" size={18} strokeWidth={1.75} aria-hidden="true" />
      {what} werden geladen …
    </p>
  );
}

/** Error: says what failed and offers the one retry. */
export function ErrorNote({
  what,
  error,
  onRetry,
}: {
  what: string;
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <div className="rev-empty" role="alert">
      <AlertTriangle className="icon" size={18} strokeWidth={1.75} aria-hidden="true" />
      <div className="kstate">
        <p>
          <strong>{what} konnten nicht geladen werden.</strong> {errorText(error, '')}
        </p>
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Erneut versuchen
        </Button>
      </div>
    </div>
  );
}

/** Empty: a plain sentence and the one action that fills the page. */
export function EmptyNote({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rev-empty">
      <CheckCircle2 className="icon" size={18} strokeWidth={1.75} aria-hidden="true" />
      <div className="kstate">
        <p>{children}</p>
        {action}
      </div>
    </div>
  );
}
