import { Button } from '@budget/ui';
import { useState } from 'react';

export interface RecoveryCodesProps {
  codes: ReadonlyArray<string>;
}

/**
 * The ten recovery codes in a 2x5 list with a copy button. The codes live in component state only:
 * they are never logged or stored, and they are gone once the parent unmounts this view.
 */
export function RecoveryCodes({ codes }: RecoveryCodesProps) {
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'failed'>('idle');

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
      <ol className="recovery-grid" aria-label="Wiederherstellungscodes">
        {codes.map((code) => (
          <li key={code} className="recovery-code">
            {code}
          </li>
        ))}
      </ol>
      <div className="recovery-actions">
        <Button variant="ghost" size="sm" onClick={() => void copy()}>
          Codes kopieren
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
