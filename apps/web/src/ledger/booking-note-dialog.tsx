import { Button, FormDialog, TextInput } from '@budget/ui';
import { useId, useRef, useState } from 'react';
import { readNotePreview, type BookingNotePreview } from './api';
import { errorText, SKIP_REASON_LABEL } from './labels';

export function BookingNoteDialog({
  ids,
  onClose,
  onConfirm,
}: {
  ids: string[];
  onClose: () => void;
  onConfirm: (preview: BookingNotePreview) => Promise<void>;
}) {
  const [memo, setMemo] = useState('');
  const noteId = useId();
  const [preview, setPreview] = useState<BookingNotePreview>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const accepting = useRef(false);
  const run = async (confirm: boolean) => {
    if (accepting.current) return;
    accepting.current = true;
    setBusy(true);
    setFailure('');
    try {
      if (confirm && preview && preview.changed.length) {
        await onConfirm(preview);
        onClose();
      } else setPreview(await readNotePreview(ids, memo === '' ? null : memo));
    } catch (error) {
      setPreview(undefined);
      setFailure(errorText(error));
    } finally {
      accepting.current = false;
      setBusy(false);
    }
  };
  return (
    <FormDialog
      open
      title="Notiz gesammelt ändern"
      onClose={onClose}
      beforeClose={() => !accepting.current}
    >
      <form
        className="bkform kdelete-preview"
        aria-busy={busy}
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="bk-head">
          <h2>Notiz gesammelt ändern</h2>
        </div>
        <div className="bk-body">
          <label htmlFor={noteId}>
            Neue Notiz
            <TextInput
              id={noteId}
              value={memo}
              maxLength={500}
              disabled={busy}
              onChange={(event) => {
                setMemo(event.target.value);
                setPreview(undefined);
                setFailure('');
              }}
            />
          </label>
          <p>
            Ersetzt die bisherige Buchungsnotiz. Ein leeres Feld entfernt sie. Notizen einzelner
            Teilbeträge bleiben erhalten.
          </p>
          {preview && (
            <section aria-label="Vorschau der Notizänderung">
              <p role="status">
                {preview.ids.length} ausgewählt · {preview.changed.length} werden geändert ·{' '}
                {preview.skipped.length} geschützt · {preview.unchanged.length} bereits unverändert.
              </p>
              <p>Neue Notiz: {preview.memo ?? 'Notiz entfernen'}</p>
              {preview.skipped.length > 0 && (
                <ul>
                  {preview.skipped.map((item) => (
                    <li key={item.id}>
                      {item.booking?.description ?? 'Buchung nicht mehr verfügbar'} ·{' '}
                      {item.booking?.accountName} · {SKIP_REASON_LABEL[item.reason]}
                    </li>
                  ))}
                </ul>
              )}
              <p>
                Geschützte Buchungen werden übersprungen. Ein Rückgängig stellt alle geänderten
                Notizen gemeinsam wieder her.
              </p>
            </section>
          )}
          {failure && <p role="alert">{failure}</p>}
        </div>
        <div className="bk-foot">
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Abbrechen
          </Button>
          <Button disabled={busy} onClick={() => void run(false)}>
            Änderungen prüfen
          </Button>
          {preview && preview.changed.length > 0 && (
            <Button disabled={busy} onClick={() => void run(true)}>
              Änderungen übernehmen
            </Button>
          )}
        </div>
      </form>
    </FormDialog>
  );
}
