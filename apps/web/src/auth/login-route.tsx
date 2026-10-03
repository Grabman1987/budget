import { useNavigate, useSearch } from '@tanstack/react-router';
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
        if (weiter) window.location.assign(weiter);
        else await navigate({ to: '/' });
      }}
    />
  );
}
