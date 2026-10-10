import { Button, FormDialog, WideDialog } from '@budget/ui';
import { useState } from 'react';
import { AppLink } from '../shell/app-link';

type Kind = 'form' | 'wide';

const LINES = Array.from({ length: 40 }, (_, i) => `Zeile ${i + 1} des langen Inhalts`);

/**
 * Developer harness for detail routes and input dialogs (`/dev/panels`, only in dev and the e2e
 * build), independent of any product page. The mobile dialog
 * regression spec (e2e/mobile-panels.spec.ts, WebKit iPhone and Chromium mobile) opens them here.
 */
export function PanelsHarnessPage() {
  const [open, setOpen] = useState<Kind | null>(null);
  const close = () => setOpen(null);
  return (
    <main className="sheet" style={{ padding: 24 }}>
      <h1>Detailseite und Eingabedialoge</h1>
      <p>Prüfstand für Detailseiten, Formulardialog und großen Eingabedialog.</p>
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
        <AppLink
          className="btn btn-ghost"
          to="/dev/details"
          search={{ titel: 'Detail kurz', von: 'panels' }}
        >
          Detail kurz
        </AppLink>
        <AppLink
          className="btn btn-ghost"
          to="/dev/details"
          search={{ titel: 'Detail lang', lang: true, von: 'panels' }}
        >
          Detail lang
        </AppLink>
        <Button onClick={() => setOpen('form')}>Formulardialog</Button>
        <Button onClick={() => setOpen('wide')}>Arbeitsdialog</Button>
      </p>
      {/* Makes the page itself scrollable, so that "the background does not scroll" is testable. */}
      <div aria-hidden="true" style={{ height: 1600 }} />
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
        <form
          className="contacts-form"
          onSubmit={(event) => {
            event.preventDefault();
            close();
          }}
        >
          {LINES.map((line, i) => (
            <label key={line}>
              Eingabe {i + 1}
              <input className="input" type="text" />
            </label>
          ))}
          <Button type="submit">Speichern</Button>
        </form>
      </WideDialog>
    </main>
  );
}
