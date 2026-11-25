import { Button } from '@budget/ui';
import { FileUp } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';

export type { Classification, DetectedType, Target } from './document-upload-flow';

// The flow (statement review, payslip and receipt dialogs, trade hand-off: a large part of the app)
// is its own chunk, fetched when the owner first opens the upload.
const UploadFlow = lazy(() =>
  import('./document-upload-flow').then((m) => ({ default: m.UploadFlow })),
);

/**
 * One upload for every document kind. The server only classifies; "Weiter" then hands the same
 * File to the existing receipt, statement-review or payslip flow, which keeps its own behaviour.
 * A broker trade confirmation is not sent again: its read values open the existing trade form.
 */
export function DocumentUploadButton({
  accountId,
  label = 'Dokument hochladen',
  compact = false,
}: {
  /** Account context: pre-selects the account for statements. */
  accountId?: string | undefined;
  label?: string | undefined;
  /** Icon-only trigger for the top bar; the accessible name stays `label`. */
  compact?: boolean | undefined;
}) {
  // The flow (queries, write helper, hand-off dialogs) mounts on first use only, so a trigger in
  // shared chrome costs nothing until the owner opens it, and the hand-off survives closing.
  const [open, setOpen] = useState(false),
    [mounted, setMounted] = useState(false);
  const start = () => {
    setMounted(true);
    setOpen(true);
  };
  return (
    <>
      {compact ? (
        <button type="button" className="icon-btn" aria-label={label} title={label} onClick={start}>
          <FileUp size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      ) : (
        <Button variant="ghost" onClick={start}>
          {label}
        </Button>
      )}
      {mounted && (
        <Suspense fallback={null}>
          <UploadFlow accountId={accountId} open={open} setOpen={setOpen} />
        </Suspense>
      )}
    </>
  );
}
