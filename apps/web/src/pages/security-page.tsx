import {
  Button,
  Field,
  FormDialog,
  SectionHead,
  TextInput,
  useToast,
  maskMoneyText,
  useAmountPrivacy,
} from '@budget/ui';
import { useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import {
  deletePasskey,
  fetchPasskeys,
  logout,
  regenerateRecoveryCodes,
  revokeOtherSessions,
  type AuthStatus,
  type PasskeyInfo,
} from '../auth/api';
import { defaultDeviceName } from '../auth/device-name';
import { RecoveryCodesGate } from '../auth/recovery-codes';
import { AUTH_STATUS_KEY, PASSKEYS_KEY } from '../auth/status-query';
import { authErrorMessage, registerPasskey, withStepUp } from '../auth/webauthn';
import { SECURITY_META } from '../nav/pages';
import { PageFrame } from './placeholder-page';
import { clearDeviceFinancialData } from '../pwa/local-data';
import { StorageStatus } from '../pwa/storage-status';

import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { SettingsDraftGuard } from './settings-draft-guard';
import { KeyRound, ShieldCheck, Monitor } from 'lucide-react';

const RECOVERY_CODE_COUNT = 10;

const dateFormat = new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium' });
const formatDate = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '–' : dateFormat.format(date);
};

/** Einstellungen › Sicherheit inside the page frame (title block and registers). */
export function SecurityPage() {
  useAmountPrivacy();
  const navigate = useNavigate();
  return (
    <PageFrame meta={SECURITY_META}>
      {!REDESIGN_ENABLED && <StorageStatus />}
      <SecurityPanel onLoggedOut={() => void navigate({ to: '/login' })} />
      {REDESIGN_ENABLED && (
        <details className="settings-advanced">
          <summary>Speicher auf diesem Gerät</summary>
          <StorageStatus />
        </details>
      )}
    </PageFrame>
  );
}

export interface SecurityPanelProps {
  /** Called after the session ended (caches are cleared already). */
  onLoggedOut: () => void;
}

/** Passkeys, recovery codes and sign-out. Sensitive actions ask for a fresh step-up. */
export function SecurityPanel({ onLoggedOut }: SecurityPanelProps) {
  useAmountPrivacy();
  const queryClient = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: PASSKEYS_KEY, queryFn: fetchPasskeys });
  const [error, setError] = useState<string | undefined>();
  const [adding, setAdding] = useState(false);
  const [deviceName, setDeviceName] = useState(defaultDeviceName);
  const [confirmId, setConfirmId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [confirmSessions, setConfirmSessions] = useState(false);
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
      try {
        await logout();
      } catch (caught) {
        // Also when the server could not be reached: the data must not stay on a device the user
        // meant to sign out of. The error stays visible; the hand-over happens only on success.
        queryClient.clear();
        await clearDeviceFinancialData();
        throw caught;
      }
      // Revoke immediately. Keep only a confirmed signed-out status while the router reaches
      // /login; clearing that live query would fetch it again during the hand-over.
      const clearing = clearDeviceFinancialData();
      await queryClient.cancelQueries();
      queryClient.setQueryData<AuthStatus>(AUTH_STATUS_KEY, {
        setupRequired: false,
        authenticated: false,
        stepUpValidUntil: null,
        viaRecovery: false,
      });
      queryClient.removeQueries({
        predicate: ({ queryKey }) =>
          queryKey.length !== AUTH_STATUS_KEY.length ||
          queryKey[0] !== AUTH_STATUS_KEY[0] ||
          queryKey[1] !== AUTH_STATUS_KEY[1],
      });
      window.dispatchEvent(
        new CustomEvent('budget-session-expired', { detail: { fromStatus: true } }),
      );
      await clearing;
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

  if (REDESIGN_ENABLED)
    return (
      <div className="settings-security-v2">
        <div className="settings-primary-head">
          <h2>Sicherheit</h2>
        </div>
        {error && (
          <p className="field-error" role="alert">
            {maskMoneyText(error)}
          </p>
        )}
        {list.isPending && <p role="status">Sicherheit wird geladen …</p>}
        {list.isError && (
          <p role="alert">
            {authErrorMessage(list.error)}{' '}
            <Button variant="ghost" onClick={() => void list.refetch()}>
              Erneut laden
            </Button>
          </p>
        )}
        <section aria-labelledby="sec-passkeys" className="settings-security-section">
          <h3 id="sec-passkeys" className="settings-section-title">
            Passkeys
          </h3>
          <div className="settings-surface">
            {list.data?.passkeys.map((passkey) => (
              <div className="settings-row" key={passkey.id}>
                <div className="settings-security-copy">
                  <KeyRound size={20} aria-hidden="true" />
                  <div>
                    <strong>{passkey.deviceName}</strong>
                    {passkey.current && <span className="sec-mark tech">dieses Gerät</span>}
                    <small>
                      Angelegt {formatDate(passkey.createdAt)} · Zuletzt verwendet{' '}
                      {passkey.lastUsedAt ? formatDate(passkey.lastUsedAt) : 'noch nie'}
                    </small>
                  </div>
                </div>
                {confirmId === passkey.id ? (
                  <div className="settings-row-actions">
                    <Button variant="ghost" disabled={busy} onClick={() => void revoke(passkey)}>
                      Endgültig entfernen
                    </Button>
                    <Button variant="ghost" disabled={busy} onClick={() => setConfirmId(undefined)}>
                      Abbrechen
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    aria-label={`Passkey ${passkey.deviceName} entfernen`}
                    onClick={() => {
                      setError(undefined);
                      setConfirmId(passkey.id);
                    }}
                  >
                    Entfernen
                  </Button>
                )}
              </div>
            ))}
            {list.data?.passkeys.length === 0 && (
              <p className="settings-empty-row">Keine Passkeys verfügbar.</p>
            )}
            <div className="settings-row">
              <div>
                <strong>Weiteres Gerät</strong>
                <small>Mit Passkey auf einem weiteren Gerät anmelden.</small>
              </div>
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
          </div>
          {adding && (
            <form className="settings-compact-form" onSubmit={submitAdd} noValidate>
              <SettingsDraftGuard dirty={deviceName !== defaultDeviceName()} busy={busy} />
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
              <div className="settings-form-actions">
                <Button type="submit" disabled={busy}>
                  Passkey anlegen
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    if (
                      deviceName === defaultDeviceName() ||
                      window.confirm('Ungespeicherte Änderungen verwerfen?')
                    )
                      setAdding(false);
                  }}
                >
                  Abbrechen
                </Button>
              </div>
            </form>
          )}
        </section>
        <section aria-labelledby="sec-recovery" className="settings-security-section">
          <h3 id="sec-recovery" className="settings-section-title">
            Wiederherstellungscodes
          </h3>
          <div className="settings-surface">
            <div className="settings-row">
              <div className="settings-security-copy">
                <ShieldCheck size={20} aria-hidden="true" />
                <div>
                  <strong>Wiederherstellungscodes</strong>
                  <small>
                    {list.data
                      ? `${list.data.recoveryCodesRemaining} von ${RECOVERY_CODE_COUNT} Codes noch gültig.`
                      : 'Anzahl wird geladen …'}
                  </small>
                </div>
              </div>
              <Button
                variant="ghost"
                disabled={busy || !list.data}
                onClick={() => void regenerate()}
              >
                Wiederherstellungscodes neu erzeugen
              </Button>
            </div>
          </div>
          <p className="settings-source-stamp">Die bisherigen Codes werden damit ungültig.</p>
          {newCodes && (
            <RecoveryCodesGate
              codes={newCodes}
              continueLabel="Fertig"
              onContinue={() => setNewCodes(undefined)}
            />
          )}
        </section>
        <section aria-labelledby="sec-session" className="settings-security-section">
          <h3 id="sec-session" className="settings-section-title">
            Sitzungen
          </h3>
          <div className="settings-surface">
            <div className="settings-row">
              <div className="settings-security-copy">
                <Monitor size={20} aria-hidden="true" />
                <div>
                  <strong>Angemeldete Geräte</strong>
                  <small>
                    {list.data
                      ? list.data.otherSessions === 0
                        ? 'Keine anderen Sitzungen aktiv.'
                        : `${list.data.otherSessions} weitere ${list.data.otherSessions === 1 ? 'Sitzung aktiv' : 'Sitzungen aktiv'}.`
                      : 'Sitzungen werden geladen …'}
                  </small>
                </div>
              </div>
              <Button
                variant="ghost"
                disabled={busy || !list.data}
                onClick={() => setConfirmSessions(true)}
              >
                Alle anderen Sitzungen beenden
              </Button>
            </div>
            <div className="settings-row">
              <div>
                <strong>Dieses Gerät</strong>
                <small>Lokale Finanzdaten werden beim Abmelden entfernt.</small>
              </div>
              <Button variant="ghost" disabled={busy} onClick={() => void signOut()}>
                Abmelden
              </Button>
            </div>
          </div>
        </section>
        {list.dataUpdatedAt > 0 && (
          <p className="settings-source-stamp">
            Sicherheitsstatus geladen: {new Date(list.dataUpdatedAt).toLocaleString('de-AT')}
          </p>
        )}
        <FormDialog
          open={confirmSessions}
          title="Alle anderen Sitzungen beenden?"
          beforeClose={() => !busy}
          onClose={() => setConfirmSessions(false)}
        >
          <p>
            Meldet alle anderen Browser und Wiederherstellungs-Anmeldungen ab. Diese Sitzung bleibt.
          </p>
          <div className="settings-form-actions">
            <Button variant="ghost" disabled={busy} onClick={() => setConfirmSessions(false)}>
              Abbrechen
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                setConfirmSessions(false);
                void endOthers();
              }}
            >
              Sitzungen beenden
            </Button>
          </div>
        </FormDialog>
      </div>
    );
  return (
    <div className="security">
      {error && (
        <p className="field-error" role="alert">
          {maskMoneyText(error)}
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
