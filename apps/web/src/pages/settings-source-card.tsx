import { Button, SourceStamp, StatusMark } from '@budget/ui';
import type { LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';

export function sourceDate(value: string | null | undefined) {
  if (value === undefined) return 'Nicht verfügbar';
  return value ? new Date(value).toLocaleString('de-AT') : 'Noch kein erfolgreicher Abruf';
}

/** The reference's source row, backed by the existing adapter; configuration stays with its writer. */
export function SettingsSourceCard({
  title,
  icon: Icon,
  status,
  attention = false,
  detail,
  date,
  next,
  loading,
  error,
  onRetry,
  children,
  action,
  initiallyOpen = false,
}: {
  title: string;
  icon: LucideIcon;
  status: string;
  attention?: boolean;
  detail: ReactNode;
  date: string | null | undefined;
  next?: ReactNode;
  loading?: boolean;
  error?: boolean;
  onRetry: () => void;
  children: ReactNode;
  action?: ReactNode;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <section className="settings-source-card settings-surface" aria-label={title}>
      <div className="settings-source-head">
        <span className="settings-source-icon">
          <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
        </span>
        <div className="settings-source-copy">
          <div className="settings-source-title">
            <strong>{title}</strong>
            {loading ? (
              <SourceStamp>Lädt …</SourceStamp>
            ) : (
              <StatusMark status={attention || error ? 'warning' : 'met'}>
                {loading ? 'Lädt …' : error ? 'Dienst nicht erreichbar' : status}
              </StatusMark>
            )}
          </div>
          <small>{detail}</small>
          <small>
            Letzter Erfolg: {sourceDate(date)}
            {next && <> · Nächster Abruf: {next}</>}
          </small>
        </div>
        <div className="settings-row-actions">
          {error ? (
            <Button variant="ghost" onClick={onRetry}>
              Erneut laden
            </Button>
          ) : (
            action
          )}
          <Button variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
            {attention ? 'Prüfen' : 'Verwalten'}
          </Button>
        </div>
      </div>
      {error && (
        <p className="settings-source-error" role="alert">
          {title} konnte nicht aktualisiert werden. Ein vorhandener Stand kann veraltet sein.
        </p>
      )}
      <details
        className="settings-source-details"
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary>{title}: Einrichtung und Details</summary>
        <div>{children}</div>
      </details>
    </section>
  );
}
