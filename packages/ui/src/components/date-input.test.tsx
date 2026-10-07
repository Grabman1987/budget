// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { TextInput } from './field';

afterEach(cleanup);
function Form() {
  const [value, setValue] = useState('2026-02-28');
  return (
    <>
      <TextInput
        type="date"
        aria-label="Datum"
        value={value}
        min="2026-01-01"
        max="2026-12-31"
        required
        onChange={(e) => setValue(e.target.value)}
      />
      <output>{value}</output>
    </>
  );
}
it('shows German dates while preserving ISO form values and validity', () => {
  const { container } = render(<Form />);
  const input = screen.getByLabelText('Datum') as HTMLInputElement;
  expect(input.value).toBe('28.02.2026');
  expect(input.placeholder).toBe('TT.MM.JJJJ');
  fireEvent.change(input, { target: { value: '15.03.2026' } });
  expect(container.querySelector('output')?.textContent).toBe('2026-03-15');
  expect(input.checkValidity()).toBe(true);
  fireEvent.change(input, { target: { value: '31.02.2026' } });
  expect(input.checkValidity()).toBe(false);
  fireEvent.change(input, { target: { value: '2028-02-29' } });
  expect(input.value).toBe('29.02.2028');
  expect(input.checkValidity()).toBe(false);
  fireEvent.change(input, { target: { value: '' } });
  expect(input.checkValidity()).toBe(false);
});
it('keeps partial typing, accepts leap dates and reflects external values', () => {
  const { rerender } = render(
    <TextInput type="date" aria-label="Datum" value="2028-02-29" onChange={() => {}} />,
  );
  const input = screen.getByLabelText('Datum') as HTMLInputElement;
  expect(input.value).toBe('29.02.2028');
  expect(input.checkValidity()).toBe(true);
  rerender(<TextInput type="date" aria-label="Datum" value="12.0" onChange={() => {}} />);
  expect(input.value).toBe('12.0');
  expect(input.checkValidity()).toBe(false);
});
