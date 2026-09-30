// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PartsList } from './parts-list';

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

describe('PartsList keyboard operation', () => {
  it('has no row buttons when rows are not clickable', () => {
    render(<PartsList caption="T" columns={columns} groups={groups} getRowKey={(r) => r.id} />);
    // Only the two group toggles are buttons.
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('renders a real button per clickable row, named by the row name', () => {
    render(
      <PartsList
        caption="T"
        columns={columns}
        groups={groups}
        getRowKey={(r) => r.id}
        onRowClick={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Miete' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lebensmittel' })).toBeTruthy();
  });

  it('Tab reaches the row buttons and Enter / Space call onRowClick', async () => {
    const onRowClick = vi.fn();
    render(
      <PartsList
        caption="T"
        columns={columns}
        groups={groups}
        getRowKey={(r) => r.id}
        onRowClick={onRowClick}
      />,
    );
    const user = userEvent.setup();
    await user.tab(); // toggle Fixkosten
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Fixkosten/ }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Miete' }));
    await user.keyboard('{Enter}');
    expect(onRowClick).toHaveBeenLastCalledWith({ id: 'a', name: 'Miete' });
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Strom' }));
    await user.keyboard(' ');
    expect(onRowClick).toHaveBeenLastCalledWith({ id: 'b', name: 'Strom' });
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });

  it('a mouse click on the row button calls onRowClick once', async () => {
    const onRowClick = vi.fn();
    render(
      <PartsList
        caption="T"
        columns={columns}
        groups={groups}
        getRowKey={(r) => r.id}
        onRowClick={onRowClick}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Strom' }));
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });
});

describe('PartsList group toggles', () => {
  it('aria-controls resolves to the rows container (tbody) of the group and follows expansion', async () => {
    render(<PartsList caption="T" columns={columns} groups={groups} getRowKey={(r) => r.id} />);
    const toggle = screen.getByRole('button', { name: /Fixkosten/ });
    const controlled = toggle.getAttribute('aria-controls');
    expect(controlled).toBeTruthy();
    const body = document.getElementById(controlled as string);
    expect(body?.tagName).toBe('TBODY');
    expect(body?.contains(toggle)).toBe(false);
    expect(body?.textContent).toContain('Miete');
    expect(body?.textContent).not.toContain('Lebensmittel');
    await userEvent.click(toggle);
    // The id stays valid while collapsed (the container is just empty).
    expect(document.getElementById(controlled as string)).toBe(body);
    expect(body?.textContent).toBe('');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('uses a distinct id per group and per rendered list', () => {
    render(
      <>
        <PartsList caption="A" columns={columns} groups={groups} getRowKey={(r) => r.id} />
        <PartsList caption="B" columns={columns} groups={groups} getRowKey={(r) => r.id} />
      </>,
    );
    const ids = screen
      .getAllByRole('button', { name: /Fixkosten|Laufend/ })
      .map((b) => b.getAttribute('aria-controls'));
    expect(new Set(ids).size).toBe(4);
  });
});
