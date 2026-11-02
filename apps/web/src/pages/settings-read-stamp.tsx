/** Settings endpoints expose no modification time; identify the actual read without claiming a sync. */
export function SettingsReadStamp({ at, label }: { at: number; label: string }) {
  if (!at) return null;
  const date = new Date(at);
  return (
    <p className="settings-source-stamp">
      {label} geladen:{' '}
      <time dateTime={date.toISOString()}>
        {new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium', timeStyle: 'short' }).format(date)}
      </time>
    </p>
  );
}
