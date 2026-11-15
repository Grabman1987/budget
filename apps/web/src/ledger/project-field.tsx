import { Field, Select } from '@budget/ui';
import type { Lookups } from './types';

/** "Projekt" choice shared by the booking form and the bank confirmation (Prüfen). */
export function ProjectField({
  projects,
  value,
  onChange,
  disabled,
}: {
  projects: Lookups['projects'];
  value: string;
  onChange: (projectId: string) => void;
  disabled?: boolean | undefined;
}) {
  if (!projects.length) return null;
  return (
    <Field label="Projekt">
      {({ id }) => (
        <Select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">kein Projekt</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.archivedAt ? ' · archiviert' : ''}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}
