import { Button, Field, TextInput } from '@budget/ui';
import { useState, type FormEvent } from 'react';
import { recoveryLogin } from './api';
import { AuthLayout } from './auth-layout';
import { authenticateWithPasskey, authErrorMessage } from './webauthn';

export interface LoginPageProps {
  /** Called after a successful sign-in (the session cookie is set). */
  onAuthenticated: () => void | Promise<void>;
}

/** Usernameless sign-in with a passkey; the recovery code is the quiet fallback. */
export function LoginPage({ onAuthenticated }: LoginPageProps) {
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const run = async (action: () => Promise<void>, context: 'login' | 'recovery') => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      await onAuthenticated();
    } catch (caught) {
      setError(authErrorMessage(caught, context));
      setBusy(false);
    }
  };

  const passkeyLogin = () => run(authenticateWithPasskey, 'login');

  const submitRecovery = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setError('Bitte den Wiederherstellungscode eingeben.');
      return;
    }
    void run(async () => {
      await recoveryLogin(trimmed);
    }, 'recovery');
  };

  return (
    <AuthLayout
      title="Anmelden"
      subtitle="Mit dem Passkey dieses Geräts oder eines gekoppelten Geräts."
    >
      <div className="auth-stack">
        <Button disabled={busy} onClick={() => void passkeyLogin()}>
          Mit Passkey anmelden
        </Button>
        {busy && !recovery && (
          <p className="auth-lead" role="status">
            Warte auf den Passkey-Dialog. Wenn er ausbleibt, kannst du nach 60 Sekunden erneut
            versuchen oder einen Wiederherstellungscode verwenden.
          </p>
        )}
        {!recovery && error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        {!recovery && (
          <button
            type="button"
            className="quiet-link"
            onClick={() => {
              setRecovery(true);
              setError(undefined);
            }}
          >
            Wiederherstellungscode verwenden
          </button>
        )}
      </div>
      {recovery && (
        <form className="auth-stack" onSubmit={submitRecovery} noValidate>
          <Field
            label="Wiederherstellungscode"
            error={error}
            hint="Jeder Code gilt einmal. Er ersetzt den Passkey nur zur Anmeldung."
          >
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                // The field only appears after the user asked for it: focus follows that action.
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
            )}
          </Field>
          <div className="auth-actions">
            <Button type="submit" disabled={busy}>
              Mit Code anmelden
            </Button>
            <button
              type="button"
              className="quiet-link"
              onClick={() => {
                setRecovery(false);
                setError(undefined);
                setCode('');
              }}
            >
              Zurück zum Passkey
            </button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
