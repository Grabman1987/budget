// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { TextInput } from './field';

afterEach(cleanup);

function DateForm() {
  const [value, setValue] = useState('');
  return (
    <>
      <TextInput
        type="date"
        aria-label="Datum"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <output aria-label="Formularwert">{value}</output>
    </>
  );
}

it('requests a punctuation-capable keyboard and retains sequential German date entry', async () => {
  render(<DateForm />);
  const input = screen.getByLabelText('Datum');
  if (!(input instanceof HTMLInputElement)) throw new TypeError('Expected date input');
  expect(input.type).toBe('text');
  expect(input.inputMode).toBe('text');
  const user = userEvent.setup();
  await user.type(input, '12.0');
  expect(input.value).toBe('12.0');
  expect(screen.getByLabelText('Formularwert').textContent).toBe('12.0');
  expect(input.checkValidity()).toBe(false);
  await user.type(input, '3.2026');
  expect(input.value).toBe('12.03.2026');
  expect(screen.getByLabelText('Formularwert').textContent).toBe('2026-03-12');
  expect(input.checkValidity()).toBe(true);
});
