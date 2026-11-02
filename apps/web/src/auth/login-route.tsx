import { useNavigate, useSearch } from '@tanstack/react-router';
import { captureContinuation } from '../ledger/capture-link';
import { LoginPage } from './login-page';
import { refreshAuthStatus } from './status-query';

/** `/login`: signs in and continues to the app. Lives in its own chunk (loaded by the router). */
export function LoginRoute() {
  const navigate = useNavigate();
  const { weiter } = useSearch({ from: '/login' });
  return (
    <LoginPage
      onAuthenticated={async () => {
        await refreshAuthStatus();
        const continuation = captureContinuation(weiter);
        if (continuation) window.location.assign(continuation);
        else await navigate({ to: '/' });
      }}
    />
  );
}
