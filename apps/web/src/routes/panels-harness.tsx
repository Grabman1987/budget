import { Button, DetailPanel, FormDialog, WideDialog } from '@budget/ui';
import { useState } from 'react';

type Kind = 'detail' | 'detail-long' | 'form' | 'wide';

const LINES = Array.from({ length: 40 }, (_, i) => `Zeile ${i + 1} des langen Inhalts`);

/**
 * Developer harness for the shared panel primitive (`/dev/panels`, only in `vite dev` and the e2e
 * build): every variant with short and long content, independent of any page. The mobile panel
 * regression spec (e2e/mobile-panels.spec.ts, WebKit iPhone and Chromium mobile) opens them here.
 */
export function PanelsHarnessPage() {
  const [open, setOpen] = useState<Kind | null>(null);
  const close = () => setOpen(null);
  return (
    <main className="sheet" style={{ padding: 24 }}>
      <h1>Panel-Primitive</h1>
      <p>Prüfstand für Seitenpanel, Bottom Sheet, Formulardialog und großen Arbeitsdialog.</p>
      <p
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          position: 'sticky',
          top: 0,
          background: 'var(--ground)',
        }}
      >
        <Button onClick={() => setOpen('detail')}>Detail kurz</Button>
        <Button onClick={() => setOpen('detail-long')}>Detail lang</Button>
        <Button onClick={() => setOpen('form')}>Formulardialog</Button>
        <Button onClick={() => setOpen('wide')}>Arbeitsdialog</Button>
      </p>
      {/* Makes the page itself scrollable, so that "the background does not scroll" is testable. */}
      <div aria-hidden="true" style={{ height: 1600 }} />
      <DetailPanel open={open === 'detail'} onClose={close} title="Detail kurz">
        <p>Ein kurzer Inhalt.</p>
        <Button onClick={close}>Fertig</Button>
      </DetailPanel>
      <DetailPanel open={open === 'detail-long'} onClose={close} title="Detail lang">
        {LINES.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <Button onClick={close}>Fertig</Button>
      </DetailPanel>
      <FormDialog open={open === 'form'} onClose={close} title="Formulardialog">
        {open === 'form' && (
          <form
            className="bkform"
            onSubmit={(e) => {
              e.preventDefault();
              close();
            }}
          >
            <div className="bk-head">
              <strong className="bk-kind-fixed">Formulardialog</strong>
              <button type="button" className="icon-btn" aria-label="Schließen" onClick={close}>
                ×
              </button>
            </div>
            <div className="bk-body" style={{ display: 'grid' }}>
              {LINES.slice(0, 14).map((line) => (
                <label key={line} className="field-row">
                  {line}
                  <input type="text" />
                </label>
              ))}
            </div>
            <div className="bk-foot">
              <Button type="submit">Speichern</Button>
            </div>
          </form>
        )}
      </FormDialog>
      <WideDialog open={open === 'wide'} onClose={close} title="Arbeitsdialog">
        {LINES.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <Button onClick={close}>Fertig</Button>
      </WideDialog>
    </main>
  );
}
