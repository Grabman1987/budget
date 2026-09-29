import { useNavigate } from '@tanstack/react-router';
import { LoginPage } from './login-page';
import { refreshAuthStatus } from './status-query';

/** `/login`: signs in and continues to the app. Lives in its own chunk (loaded by the router). */
export function LoginRoute() {
  const navigate = useNavigate();
  return (
    <LoginPage
      onAuthenticated={async () => {
        await refreshAuthStatus();
        await navigate({ to: '/' });
      }}
    />
  );
}
