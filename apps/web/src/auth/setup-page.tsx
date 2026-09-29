import { Button, Field, TextInput } from '@budget/ui';
import { useState, type FormEvent } from 'react';
import { ApiError } from './api';
import { AuthLayout } from './auth-layout';
import { defaultDeviceName } from './device-name';
import { RecoveryCodesGate } from './recovery-codes';
import { authErrorMessage, registerPasskey } from './webauthn';

export interface SetupPageProps {
  /** Called when the person leaves the page ("Weiter zu Budget"); the session is already set. */
  onDone: () => void | Promise<void>;
}

/** First device: setup token plus device name create the first passkey, then the recovery codes. */
export function SetupPage({ onDone }: SetupPageProps) {
  const [token, setToken] = useState('');
  const [deviceName, setDeviceName] = useState(defaultDeviceName);
  const [busy, setBusy] = useState(false);
  const [tokenError, setTokenError] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [codes, setCodes] = useState<string[] | undefined>();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTokenError(undefined);
    setError(undefined);
    if (!token.trim()) {
      setTokenError('Bitte den Einrichtungscode eingeben.');
      return;
    }
    if (!deviceName.trim()) {
      setError('Bitte einen Gerätenamen eingeben.');
      return;
    }
    setBusy(true);
    try {
      const result = await registerPasskey({ setupToken: token.trim(), deviceName });
      // The token is not needed any more; drop it from memory right away.
      setToken('');
      if (result.recoveryCodes?.length) setCodes(result.recoveryCodes);
      else await onDone();
    } catch (caught) {
      const message = authErrorMessage(caught, 'setup');
      if (caught instanceof ApiError && caught.code === 'setup_token_invalid') {
        setTokenError(message);
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  if (codes) {
    return (
      <AuthLayout
        title="Wiederherstellungscodes"
        subtitle="Diese Codes werden nur jetzt angezeigt. Sie öffnen Budget, falls kein Passkey mehr verfügbar ist."
      >
        <RecoveryCodesGate
          codes={codes}
          continueLabel="Weiter zu Budget"
          onContinue={() => void onDone()}
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Einrichten" subtitle="Der erste Passkey schützt Budget auf diesem Gerät.">
      <form className="auth-stack" onSubmit={(event) => void submit(event)} noValidate>
        <p className="auth-lead">
          Budget ist privat. Der Einrichtungscode gilt genau einmal. Danach meldet ein Passkey
          (Fingerabdruck, Gesichtserkennung oder Geräte-PIN) an.
        </p>
        <Field label="Einrichtungscode" error={tokenError}>
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-describedby={describedBy}
              aria-invalid={invalid}
            />
          )}
        </Field>
        <Field label="Gerätename" hint="Damit ist der Passkey später in der Liste erkennbar.">
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              value={deviceName}
              onChange={(event) => setDeviceName(event.target.value)}
              autoComplete="off"
              maxLength={60}
              aria-describedby={describedBy}
            />
          )}
        </Field>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div>
          <Button type="submit" disabled={busy}>
            Passkey anlegen
          </Button>
        </div>
      </form>
    </AuthLayout>
  );
}
