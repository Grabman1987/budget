import { Button, Field, Select, TextInput, useToast } from '@budget/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createContact, undoGroup } from './api';
import { errorText } from './labels';
import { lookupsQuery } from './queries';
import type { Lookups } from './types';

const NEW = '__new-contact';

/**
 * Contact pick list with "+ Neuer Kontakt…" at the end: a name field opens in place, the contact
 * is created through the contacts API and selected at once. Creating is its own undo group (the
 * toast offers "Rückgängig"), the booking saved afterwards has its own, as every write.
 */
export function ContactSelect({
  label,
  value,
  onChange,
  contacts,
  noneLabel,
  hint,
  error,
}: {
  label: string;
  value: string;
  onChange: (contactId: string) => void;
  contacts: ReadonlyArray<{ id: string; name: string }>;
  noneLabel: string;
  hint?: ReactNode;
  error?: string | undefined;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | undefined>();
  const select = useRef<HTMLSelectElement>(null);
  const nameField = useRef<HTMLInputElement>(null);
  // The undo toast outlives this render: it must see which contact is selected by then.
  const current = useRef(value);
  useEffect(() => {
    current.current = value;
  }, [value]);

  const close = () => {
    setCreating(false);
    setName('');
    setProblem(undefined);
  };
  const cancel = () => {
    close();
    select.current?.focus();
  };

  const create = async () => {
    const trimmed = name.trim();
    if (trimmed === '' || busy) return;
    const same = contacts.find(
      (c) => c.name.toLocaleLowerCase('de-AT') === trimmed.toLocaleLowerCase('de-AT'),
    );
    if (same) {
      onChange(same.id);
      close();
      select.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const { contact, groupId } = await createContact(trimmed);
      // Listed at once; the refetch confirms it.
      qc.setQueryData<Lookups>(lookupsQuery().queryKey, (old) =>
        old
          ? {
              ...old,
              contacts: [...old.contacts, contact].sort((a, b) =>
                a.name.localeCompare(b.name, 'de-AT'),
              ),
            }
          : old,
      );
      void qc.invalidateQueries({ queryKey: lookupsQuery().queryKey });
      onChange(contact.id);
      close();
      select.current?.focus();
      toast.show({
        message: `Kontakt „${contact.name}“ angelegt.`,
        actionLabel: 'Rückgängig',
        onAction: () =>
          void undoGroup(groupId).then(
            () => {
              if (current.current === contact.id) onChange('');
              return qc.invalidateQueries({ queryKey: lookupsQuery().queryKey });
            },
            (e: unknown) => toast.show({ message: errorText(e) }),
          ),
      });
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const onNameKey = (e: KeyboardEvent<HTMLInputElement>) => {
    // Enter creates the contact (it must not move on in the booking form); Ctrl+Enter still saves.
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      void create();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  };

  return (
    <div className="kcontact">
      <Field label={label} error={error} hint={hint}>
        {({ id, describedBy, invalid }) => (
          <Select
            id={id}
            ref={select}
            value={value}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            onChange={(e) => {
              if (e.target.value === NEW) {
                setCreating(true);
                requestAnimationFrame(() => nameField.current?.focus());
              } else {
                close();
                onChange(e.target.value);
              }
            }}
          >
            <option value="">{noneLabel}</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={NEW}>+ Neuer Kontakt…</option>
          </Select>
        )}
      </Field>
      {creating && (
        <div className="kcontact-new" role="group" aria-label="Neuer Kontakt">
          <Field label="Name des neuen Kontakts" error={problem}>
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                ref={nameField}
                value={name}
                maxLength={200}
                autoComplete="off"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={onNameKey}
              />
            )}
          </Field>
          <div className="kcontact-actions">
            <Button size="sm" disabled={busy || name.trim() === ''} onClick={() => void create()}>
              Kontakt anlegen
            </Button>
            <Button size="sm" variant="ghost" onClick={cancel}>
              Abbrechen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
