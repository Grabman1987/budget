// @vitest-environment jsdom
import { cents } from '@budget/domain';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AmountInput } from './amount-input';
import { DimensionChain } from './dimension-chain';
import { PartsList } from './parts-list';
import { Registers } from './registers';
import { RevisionTable } from './revision-table';
import { Segmented } from './segmented';
import { StatusMark } from './stamps';
import { Switch } from './switch';
import { TitleBlock } from './title-block';
import { ToastProvider, useToast } from './toast';

function AmountHarness({ onCommit }: { onCommit?: (c: number) => void }) {
  const [value, setValue] = useState('');
  return (
    <AmountInput
      label="Betrag"
      value={value}
      onChange={setValue}
      onCommit={(c) => onCommit?.(c)}
      sign={'−'}
    />
  );
}

describe('AmountInput', () => {
  it('shows the evaluated result while typing an expression', async () => {
    render(<AmountHarness />);
    await userEvent.type(screen.getByLabelText('Betrag'), '12,50+8,20');
    expect(screen.getByText(/= 20,70 €/)).toBeTruthy();
  });

  it('Enter evaluates, formats the field and commits cents', async () => {
    const onCommit = vi.fn();
    render(<AmountHarness onCommit={onCommit} />);
    const input = screen.getByLabelText('Betrag') as HTMLInputElement;
    await userEvent.type(input, '1.000+576{Enter}');
    expect(input.value).toBe('1.576,00');
    expect(onCommit).toHaveBeenCalledWith(157600);
  });

  it('operator buttons insert the sign at the caret', async () => {
    render(<AmountHarness />);
    const input = screen.getByLabelText('Betrag') as HTMLInputElement;
    await userEvent.type(input, '1250');
    input.setSelectionRange(2, 2);
    await userEvent.click(screen.getByRole('button', { name: 'Plus' }));
    expect(input.value).toBe('12+50');
    await userEvent.click(screen.getByRole('button', { name: 'Mal' }));
    expect(input.value).toBe('12+×50');
  });

  it('flags input that cannot be evaluated, without eval', async () => {
    render(<AmountHarness />);
    const input = screen.getByLabelText('Betrag');
    await userEvent.type(input, 'alert(1)');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText(/lässt sich nicht ausrechnen/)).toBeTruthy();
  });

  it('commits a calculation when the field loses focus', async () => {
    const onCommit = vi.fn();
    render(<AmountHarness onCommit={onCommit} />);
    const input = screen.getByLabelText('Betrag') as HTMLInputElement;
    await userEvent.type(input, '10÷4');
    fireEvent.blur(input);
    expect(input.value).toBe('2,50');
    expect(onCommit).toHaveBeenCalledWith(250);
  });
});

describe('Segmented and Switch', () => {
  it('marks the active segment and reports changes', async () => {
    const onChange = vi.fn();
    render(
      <Segmented
        label="Zeitraum"
        value="1M"
        onChange={onChange}
        options={[
          { value: '1M', label: '1M' },
          { value: '3M', label: '3M' },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: '1M' }).getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: '3M' }));
    expect(onChange).toHaveBeenCalledWith('3M');
  });

  it('switch toggles and exposes aria-checked', async () => {
    const onChange = vi.fn();
    render(<Switch label="Automatisch" checked={false} onChange={onChange} />);
    const sw = screen.getByRole('switch', { name: 'Automatisch' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    await userEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('DimensionChain', () => {
  it('balances rounded parts so the chain adds up as displayed', () => {
    render(
      <DimensionChain
        label="Kette"
        terms={[
          { label: 'A', value: cents(33340) },
          { label: 'B', value: cents(33340), op: '+' },
          { label: 'C', value: cents(33340), op: '+' },
          { label: 'Summe', value: cents(100020), op: '=' },
        ]}
      />,
    );
    const group = screen.getByRole('group', { name: 'Kette' });
    const shown = Array.from(group.querySelectorAll('.ct-val')).map((el) => el.textContent);
    expect(shown).toEqual(['334 €', '333 €', '333 €', '1.000 €']);
  });

  it('renders selectable terms as buttons and uses the real minus operator', async () => {
    const onSelect = vi.fn();
    render(
      <DimensionChain
        label="Kette"
        terms={[
          { label: 'Einnahmen', value: cents(300000), onSelect },
          { label: 'Zugewiesen', value: cents(100000), op: '-' },
          { label: 'Zu verteilen', value: cents(200000), op: '=' },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Einnahmen/ }));
    expect(onSelect).toHaveBeenCalled();
    expect(document.body.textContent).toContain('−');
  });
});

describe('PartsList', () => {
  const groups = [
    {
      id: 'g1',
      title: 'Fixkosten',
      rows: [
        { id: 'a', name: 'Miete' },
        { id: 'b', name: 'Strom' },
      ],
    },
    { id: 'g2', title: 'Laufend', rows: [{ id: 'c', name: 'Lebensmittel' }] },
  ];
  const columns = [
    { key: 'name', header: 'Kategorie', render: (r: { name: string }) => r.name },
    { key: 'sum', header: 'Verfügbar', numeric: true, render: () => '0,00 €' },
  ];

  it('numbers positions per assembly (1.1, 1.2, 2.1)', () => {
    render(<PartsList caption="Test" columns={columns} groups={groups} getRowKey={(r) => r.id} />);
    const positions = Array.from(document.querySelectorAll('.prow .pos')).map((e) => e.textContent);
    expect(positions).toEqual(['1.1', '1.2', '2.1']);
  });

  it('collapses and expands an assembly', async () => {
    render(<PartsList caption="Test" columns={columns} groups={groups} getRowKey={(r) => r.id} />);
    const toggle = screen.getByRole('button', { name: /Fixkosten/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await userEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Miete')).toBeNull();
    await userEvent.click(toggle);
    expect(screen.getByText('Miete')).toBeTruthy();
  });
});

describe('RevisionTable', () => {
  it('shows revision letters, marks the urgent row and runs actions', async () => {
    const decke = vi.fn();
    render(
      <RevisionTable
        caption="Nächste Schritte"
        rows={[
          {
            id: '1',
            letter: 'A',
            title: 'Lebensmittel überzogen',
            urgent: true,
            action: { label: 'Decken', onClick: decke },
          },
          {
            id: '2',
            letter: 'B',
            title: 'Posteingang',
            action: { label: 'Öffnen', onClick: () => {} },
          },
        ]}
      />,
    );
    expect(screen.getByRole('img', { name: 'Revision A, dringend' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Revision B' })).toBeTruthy();
    const urgentRow = screen.getByText('Lebensmittel überzogen').closest('tr');
    expect(urgentRow?.className).toContain('is-urgent');
    await userEvent.click(within(urgentRow as HTMLElement).getByRole('button', { name: 'Decken' }));
    expect(decke).toHaveBeenCalled();
  });
});

describe('Toast', () => {
  function Trigger({ onUndo }: { onUndo: () => void }) {
    const { show } = useToast();
    return (
      <button
        type="button"
        onClick={() => show({ message: 'Erledigt', actionLabel: 'Rückgängig', onAction: onUndo })}
      >
        go
      </button>
    );
  }

  it('announces the message and runs undo', async () => {
    const onUndo = vi.fn();
    render(
      <ToastProvider>
        <Trigger onUndo={onUndo} />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'go' }));
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Erledigt');
    await userEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    expect(onUndo).toHaveBeenCalled();
    expect(status.className).not.toContain('is-open');
  });
});

describe('TitleBlock, Registers, StatusMark', () => {
  it('renders title block cells with lettering labels', () => {
    render(
      <TitleBlock title="September 2026" fields={[{ label: 'Stand', value: '17.09.2026' }]} />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'September 2026' })).toBeTruthy();
    expect(screen.getByText('Stand')).toBeTruthy();
  });

  it('marks the current register with aria-current', () => {
    render(
      <Registers
        label="Plan"
        current="monat"
        items={[
          { id: 'monat', label: 'Monat', href: '/plan/monat' },
          { id: 'jahr', label: 'Jahr', href: '/plan/jahr' },
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Monat' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Jahr' }).getAttribute('aria-current')).toBeNull();
  });

  it('status marks always carry a symbol and text, red only when action is needed', () => {
    const { container } = render(
      <>
        <StatusMark status="violated" />
        <StatusMark status="violated" actionNeeded />
      </>,
    );
    const marks = container.querySelectorAll('.status-mark');
    expect(marks[0]?.querySelector('svg')).toBeTruthy();
    expect(marks[0]?.textContent).toBe('verletzt');
    expect(marks[0]?.classList.contains('is-action')).toBe(false);
    expect(marks[1]?.classList.contains('is-action')).toBe(true);
  });
});
