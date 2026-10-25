import { initAmountPrivacy } from '@budget/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { queryClient } from './auth/status-query';
import { router } from './router';
import './styles.css';
import { PwaShell } from './pwa/pwa';
import { ToastProvider } from '@budget/ui';
import { QueueProvider } from './pwa/queue-ui';
import './preview.css';

initAmountPrivacy();

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');

createRoot(container).render(
  <StrictMode>
    {import.meta.env['VITE_BUDGET_PREVIEW'] === '1' && (
      <aside className="preview-banner" aria-label="Vorschauumgebung">
        VORSCHAU · Synthetische Beispieldaten · Keine echten Konten oder Dokumente verwenden
      </aside>
    )}
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <QueueProvider>
          <PwaShell>
            <RouterProvider router={router} />
          </PwaShell>
        </QueueProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
