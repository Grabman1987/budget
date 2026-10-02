import { SectionHead } from '@budget/ui';
import { useStorageProtection, type StorageProtection } from './storage-protection';

const STATUS: Record<StorageProtection, string> = {
  checking: 'Speicherschutz wird geprüft …',
  protected: 'Dauerhafter Speicher ist gewährt.',
  'best-effort':
    'Dauerhafter Speicher ist nicht gewährt. Der Browser kann lokale App-Daten entfernen.',
  unsupported: 'Dieser Browser unterstützt dauerhaften Speicher nicht.',
  unavailable: 'Der Speicherschutz konnte nicht geprüft werden.',
};
export function StorageStatus() {
  const status = useStorageProtection();
  return (
    <section className="security-section" aria-labelledby="storage-title">
      <SectionHead id="storage-title" title="Offline-Daten schützen" />
      <p role="status">{STATUS[status]}</p>
      <p>
        Gilt für dieses Gerät. Budget fragt einmal nach der Anmeldung an. Das schützt lokale
        App-Dateien vor automatischer Bereinigung; es ist keine Sicherung. Finanzdaten werden
        weiterhin vom Server geladen.
      </p>
    </section>
  );
}
