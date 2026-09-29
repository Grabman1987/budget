// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AmountInput } from './amount-input';

function Harness({
  initial = '',
  error,
  onCommit,
}: {
  initial?: string;
  error?: string;
  onCommit?: (c: number) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <AmountInput
      label="Betrag"
      value={value}
      onChange={setValue}
      error={error}
      onCommit={(c) => onCommit?.(c)}
      sign="−"
    />
  );
}

const describedBy = (el: HTMLElement) =>
  (el.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((id) => document.getElementById(id));

describe('AmountInput accessibility', () => {
  it('describes the input by the hint only when there is no error', () => {
    render(<Harness />);
    const nodes = describedBy(screen.getByLabelText('Betrag'));
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.textContent).toMatch(/Rechnen direkt im Feld/);
  });

  it('links the field-level error with aria-describedby next to the hint', () => {
    render(<Harness error="Bitte einen Betrag eingeben." />);
    const input = screen.getByLabelText('Betrag');
    const nodes = describedBy(input);
    expect(nodes).toHaveLength(2);
    expect(nodes.map((n) => n?.textContent).join('|')).toContain('Bitte einen Betrag eingeben.');
    expect(nodes.some((n) => n?.getAttribute('role') === 'alert')).toBe(true);
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('shows the result in a polite live region that stays mounted', async () => {
    render(<Harness />);
    const input = screen.getByLabelText('Betrag');
    const region = describedBy(input)[0] as HTMLElement;
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('aria-atomic')).toBe('true');
    await userEvent.type(input, '12,50+8,20');
    expect(screen.getByLabelText('Betrag')).toBe(input);
    expect(describedBy(input)[0]).toBe(region);
    expect(region.textContent).toMatch(/= 20,70 €/);
  });

  it('renders a decorative trailing euro sign inside the amount box', () => {
    const { container } = render(<Harness />);
    const cur = container.querySelector('.amount-box .amount-cur');
    expect(cur?.textContent).toBe('€');
    expect(cur?.getAttribute('aria-hidden')).toBe('true');
    // It follows the input in DOM order.
    const input = container.querySelector('.amount-input') as HTMLElement;
    expect(input.compareDocumentPosition(cur as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('operator buttons keep their names and are not focus stealers', () => {
    render(<Harness />);
    for (const name of ['Plus', 'Minus', 'Mal', 'Geteilt durch']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });
});

describe('AmountInput commit', () => {
  it('normalises a plain value on blur and commits the cents', async () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    const input = screen.getByLabelText('Betrag') as HTMLInputElement;
    await userEvent.type(input, '12,5');
    fireEvent.blur(input);
    expect(input.value).toBe('12,50');
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(1250);
  });

  it('groups thousands when a plain value is committed', async () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    const input = screen.getByLabelText('Betrag') as HTMLInputElement;
    await userEvent.type(input, '1234');
    fireEvent.blur(input);
    expect(input.value).toBe('1.234,00');
    expect(onCommit).toHaveBeenCalledWith(123400);
  });

  it('does not commit an invalid value on blur or Enter and leaves the text alone', async () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    const input = screen.getByLabelText('Betrag') as HTMLInputElement;
    await userEvent.type(input, 'abc');
    fireEvent.blur(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('abc');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('does not commit an empty field on blur', () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    fireEvent.blur(screen.getByLabelText('Betrag'));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('Enter on a plain value also normalises and commits', async () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    const input = screen.getByLabelText('Betrag') as HTMLInputElement;
    await userEvent.type(input, '7{Enter}');
    expect(input.value).toBe('7,00');
    expect(onCommit).toHaveBeenCalledWith(700);
  });
});
