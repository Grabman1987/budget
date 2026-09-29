import { Button } from '@budget/ui';
import { useId, useState } from 'react';

export interface RecoveryCodesProps {
  codes: ReadonlyArray<string>;
}

const dateFormat = new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium' });

/** Prints only the sheet: `data-print` switches the print stylesheet (auth.css) to it. */
function printSheet(): void {
  const root = document.documentElement;
  root.dataset['print'] = 'recovery';
  const clear = () => {
    delete root.dataset['print'];
    window.removeEventListener('afterprint', clear);
  };
  window.addEventListener('afterprint', clear);
  window.print();
}

/**
 * The ten recovery codes on a ruled blueprint sheet (title block, numbered lines) with print and
 * copy. The codes live in component state only: they are never logged or stored, and they are
 * gone once the parent unmounts this view.
 */
export function RecoveryCodes({ codes }: RecoveryCodesProps) {
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'failed'>('idle');
  const [created] = useState(() => dateFormat.format(new Date()));
  const headingId = useId();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopyState('done');
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <div className="recovery">
      <section className="recovery-sheet" aria-labelledby={headingId}>
        <header className="recovery-head">
          <h3 id={headingId}>Wiederherstellungscodes</h3>
          <span className="tech recovery-meta">
            {codes.length} Einmalcodes · {created}
          </span>
        </header>
        <ol className="recovery-grid" aria-label="Wiederherstellungscodes">
          {codes.map((code) => (
            <li key={code} className="recovery-code">
              {code}
            </li>
          ))}
        </ol>
        <p className="recovery-note">
          Jeder Code gilt genau einmal. Bewahre dieses Blatt getrennt vom Gerät auf.
        </p>
      </section>
      <div className="recovery-actions">
        <Button variant="ghost" size="sm" onClick={printSheet}>
          Drucken
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void copy()}>
          Kopieren
        </Button>
        <span className="recovery-status" role="status">
          {copyState === 'done' && 'Codes kopiert.'}
          {copyState === 'failed' && 'Kopieren nicht möglich. Bitte die Codes von Hand notieren.'}
        </span>
      </div>
    </div>
  );
}

export interface SavedConfirmationProps {
  codes: ReadonlyArray<string>;
  /** Label of the button that leaves the view; enabled only after the checkbox is ticked. */
  continueLabel: string;
  onContinue: () => void;
}

/** Codes, the "saved" checkbox and the button that stays disabled until it is ticked. */
export function RecoveryCodesGate({ codes, continueLabel, onContinue }: SavedConfirmationProps) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="recovery-gate">
      <RecoveryCodes codes={codes} />
      <label className="check-row">
        <input
          type="checkbox"
          checked={saved}
          onChange={(event) => setSaved(event.target.checked)}
        />
        <span>Ich habe die Codes sicher gespeichert</span>
      </label>
      <div>
        <Button disabled={!saved} onClick={onContinue}>
          {continueLabel}
        </Button>
      </div>
    </div>
  );
}
