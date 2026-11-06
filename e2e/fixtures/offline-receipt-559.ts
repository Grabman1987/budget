/** Test-only browser entry, injected by Playwright; no application route or UI is added. */
export { enqueueReceipt, sendReceiptQueue } from '../../apps/web/src/pwa/receipt-queue';
export { listReceiptIntents, clearReceiptIntents } from '../../apps/web/src/pwa/receipt-store';
export { submitCapture, sendQueue } from '../../apps/web/src/pwa/queue';
export { listQueue } from '../../apps/web/src/pwa/queue-store';
export { emptyDraft } from '../../apps/web/src/ledger/booking-model';
export { clearDeviceFinancialData } from '../../apps/web/src/pwa/local-data';
export { onApiWrite } from '../../apps/web/src/api/http';

export async function rawFiles() {
  return new Promise<{ filename: string }[]>((resolve, reject) => {
    const open = indexedDB.open('budget-receipt-intents', 1);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('files', 'readonly');
      const read = tx.objectStore('files').getAll();
      tx.oncomplete = () => {
        db.close();
        resolve(read.result as { filename: string }[]);
      };
      tx.onabort = () => {
        db.close();
        reject(new Error('Synthetic native read failed'));
      };
    };
    open.onerror = () => reject(new Error('Synthetic native open failed'));
  });
}
