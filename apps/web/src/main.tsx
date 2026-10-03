import { initAmountPrivacy } from '@budget/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { queryClient } from './auth/status-query';
import { router } from './router';
import './styles.css';
import { PwaShell } from './pwa/pwa';

initAmountPrivacy();

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <PwaShell>
        <RouterProvider router={router} />
      </PwaShell>
    </QueryClientProvider>
  </StrictMode>,
);
