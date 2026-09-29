import { useNavigate } from '@tanstack/react-router';
import { SetupPage } from './setup-page';
import { refreshAuthStatus } from './status-query';

/** `/setup`: first-device bootstrap. Lives in its own chunk (loaded by the router). */
export function SetupRoute() {
  const navigate = useNavigate();
  return (
    <SetupPage
      onDone={async () => {
        await refreshAuthStatus();
        await navigate({ to: '/' });
      }}
    />
  );
}
