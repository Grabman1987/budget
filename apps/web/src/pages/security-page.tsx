import { Button, Field, SectionHead, TextInput, useToast } from '@budget/ui';
import { useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import {
  deletePasskey,
  fetchPasskeys,
  logout,
  regenerateRecoveryCodes,
  revokeOtherSessions,
  type PasskeyInfo,
} from '../auth/api';
import { defaultDeviceName } from '../auth/device-name';
import { RecoveryCodesGate } from '../auth/recovery-codes';
import { PASSKEYS_KEY } from '../auth/status-query';
import { authErrorMessage, registerPasskey, withStepUp } from '../auth/webauthn';
import { SECURITY_META } from '../nav/pages';
import { PageFrame } from './placeholder-page';

const RECOVERY_CODE_COUNT = 10;

const dateFormat = new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium' });
const formatDate = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '–' : dateFormat.format(date);
};

/** Einstellungen › Sicherheit inside the page frame (title block and registers). */
export function SecurityPage() {
  const navigate = useNavigate();
  const passkeys = useQuery({ queryKey: PASSKEYS_KEY, queryFn: fetchPasskeys });
  return (
    <PageFrame
      meta={SECURITY_META}
      title="Sicherheit"
      subtitle="Wer darf Budget öffnen?"
      fields={[{ label: 'Passkeys', value: passkeys.data ? passkeys.data.passkeys.length : '–' }]}
    >
      <SecurityPanel onLoggedOut={() => void navigate({ to: '/login' })} />
    </PageFrame>
  );
}

export interface SecurityPanelProps {
  /** Called after the session ended (caches are cleared already). */
  onLoggedOut: () => void;
}

/** Passkeys, recovery codes and sign-out. Sensitive actions ask for a fresh step-up. */
export function SecurityPanel({ onLoggedOut }: SecurityPanelProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: PASSKEYS_KEY, queryFn: fetchPasskeys });
  const [error, setError] = useState<string | undefined>();
  const [adding, setAdding] = useState(false);
  const [deviceName, setDeviceName] = useState(defaultDeviceName);
  const [confirmId, setConfirmId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [newCodes, setNewCodes] = useState<string[] | undefined>();

  const refresh = () => queryClient.invalidateQueries({ queryKey: PASSKEYS_KEY });

  /** Runs one action at a time; any failure becomes a German message under the controls. */
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const add = () =>
    run(async () => {
      await withStepUp(() => registerPasskey({ deviceName }));
      setAdding(false);
      await refresh();
      toast.show({ message: 'Passkey hinzugefügt.' });
    });

  const revoke = (passkey: PasskeyInfo) =>
    run(async () => {
      try {
        await withStepUp(() => deletePasskey(passkey.id));
      } finally {
        setConfirmId(undefined);
      }
      await refresh();
      toast.show({ message: 'Passkey entfernt.' });
    });

  const regenerate = () =>
    run(async () => {
      const result = await withStepUp(regenerateRecoveryCodes);
      setNewCodes(result.recoveryCodes);
      await refresh();
    });

  const endOthers = () =>
    run(async () => {
      const { ended } = await withStepUp(revokeOtherSessions);
      await refresh();
      toast.show({
        message: ended === 1 ? '1 andere Sitzung beendet.' : `${ended} andere Sitzungen beendet.`,
      });
    });

  const signOut = () =>
    run(async () => {
      await logout();
      queryClient.clear();
      onLoggedOut();
    });

  const submitAdd = (event: FormEvent) => {
    event.preventDefault();
    if (!deviceName.trim()) {
      setError('Bitte einen Gerätenamen eingeben.');
      return;
    }
    void add();
  };

  return (
    <div className="security">
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <section aria-labelledby="sec-passkeys">
        <SectionHead id="sec-passkeys" title="Passkeys" />
        {list.isPending && <p className="text-muted">Lädt …</p>}
        {list.isError && (
          <p className="field-error" role="alert">
            {authErrorMessage(list.error)}
          </p>
        )}
        {list.data && (
          <ul className="sec-list">
            {list.data.passkeys.map((passkey) => (
              <li key={passkey.id} className="sec-row">
                <div className="sec-main">
                  <span className="sec-name">
                    {passkey.deviceName}
                    {passkey.current && <span className="sec-mark tech">dieses Gerät</span>}
                  </span>
                  <span className="sec-meta">
                    Angelegt {formatDate(passkey.createdAt)} · Zuletzt verwendet{' '}
                    {passkey.lastUsedAt ? formatDate(passkey.lastUsedAt) : 'noch nie'}
                  </span>
                </div>
                {confirmId === passkey.id ? (
                  <div className="sec-actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => void revoke(passkey)}
                    >
                      Endgültig entfernen
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmId(undefined)}>
                      Abbrechen
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Passkey ${passkey.deviceName} entfernen`}
                    disabled={busy}
                    onClick={() => {
                      setError(undefined);
                      setConfirmId(passkey.id);
                    }}
                  >
                    Entfernen
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {adding ? (
          <form className="sec-form" onSubmit={submitAdd} noValidate>
            <Field label="Gerätename">
              {({ id }) => (
                <TextInput
                  id={id}
                  value={deviceName}
                  onChange={(event) => setDeviceName(event.target.value)}
                  autoComplete="off"
                  maxLength={60}
                />
              )}
            </Field>
            <div className="auth-actions">
              <Button type="submit" disabled={busy}>
                Passkey anlegen
              </Button>
              <Button variant="ghost" onClick={() => setAdding(false)}>
                Abbrechen
              </Button>
            </div>
          </form>
        ) : (
          <div className="sec-add">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setError(undefined);
                setAdding(true);
              }}
            >
              Passkey hinzufügen
            </Button>
          </div>
        )}
      </section>

      <section aria-labelledby="sec-recovery">
        <SectionHead id="sec-recovery" title="Wiederherstellungscodes" />
        {list.data && (
          <p className="sec-count">
            {list.data.recoveryCodesRemaining} von {RECOVERY_CODE_COUNT} Codes noch gültig.
          </p>
        )}
        {newCodes ? (
          <RecoveryCodesGate
            codes={newCodes}
            continueLabel="Fertig"
            onContinue={() => setNewCodes(undefined)}
          />
        ) : (
          <div className="sec-add">
            <Button variant="ghost" disabled={busy} onClick={() => void regenerate()}>
              Wiederherstellungscodes neu erzeugen
            </Button>
            <p className="field-hint">Die bisherigen Codes werden damit ungültig.</p>
          </div>
        )}
      </section>

      <section aria-labelledby="sec-session">
        <SectionHead id="sec-session" title="Sitzung" />
        {list.data && (
          <p className="sec-count">
            {list.data.otherSessions === 0
              ? 'Keine anderen Sitzungen aktiv.'
              : list.data.otherSessions === 1
                ? '1 weitere Sitzung aktiv.'
                : `${list.data.otherSessions} weitere Sitzungen aktiv.`}
          </p>
        )}
        <div className="sec-add">
          <Button variant="ghost" disabled={busy} onClick={() => void endOthers()}>
            Alle anderen Sitzungen beenden
          </Button>
          <p className="field-hint">
            Meldet alle anderen Browser und Wiederherstellungs-Anmeldungen ab. Diese Sitzung bleibt.
          </p>
        </div>
        <div className="sec-add">
          <Button variant="ghost" disabled={busy} onClick={() => void signOut()}>
            Abmelden
          </Button>
        </div>
      </section>
    </div>
  );
}
