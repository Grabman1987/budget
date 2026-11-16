// @vitest-environment jsdom
import { cents } from '@budget/domain';
import { setAmountsHidden } from '@budget/ui';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REPORTS_CATALOG } from '../nav/pages';
import { ReportFrame } from './report-frame';
import { reportSectionId, useCollapsibleSections } from './month-frame';

const flag = vi.hoisted(() => ({ REDESIGN_ENABLED: true }));
vi.mock('../shell/redesign-flag', () => flag);
vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ reportId: 'onepager' }),
  useNavigate: () => vi.fn(),
}));
vi.mock('../shell/app-link', () => ({
  AppLink: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('./report-navigation', () => ({
  ReportNavigation: () => <nav aria-label="Weitere Berichte" />,
}));
vi.mock('../pages/placeholder-page', () => ({
  PageFrame: ({ children }: { children: ReactNode }) => (
    <div data-testid="legacy-frame">{children}</div>
  ),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  act(() => setAmountsHidden(false));
  flag.REDESIGN_ENABLED = true;
});
const props = {
  meta: REPORTS_CATALOG,
  title: 'Monats-One-Pager',
  subtitle: '1.1 · Wie lief der Monat?',
  reportDataBasis: 'August 2026',
  sourceDate: '2026-08-31',
  calculation: {
    label: 'Berechnung Planabweichung',
    terms: [
      { label: 'Plan', value: cents(5000) },
      { label: 'Ausgegeben', value: cents(6500), op: '-' as const },
      { label: 'Differenz', value: cents(-1500), op: '=' as const, result: true },
    ],
    result: { label: 'Über Plan', value: -1500, unit: 'money' as const },
  },
};

describe('shared R2 report frame', () => {
  it('ON puts exact supplied terms/result in the head and keeps controls, sources and explanation accessible', () => {
    render(
      <ReportFrame
        {...props}
        verdict={{ reportId: 'finanzcheck', period: '2026-08' }}
        extraFields={[{ label: 'Monat', value: <button type="button">August</button> }]}
        reportControls={<button type="button">Darstellung</button>}
      >
        <table>
          <caption>Quelldaten</caption>
          <tbody>
            <tr>
              <td>Gespeicherte Werte</td>
            </tr>
          </tbody>
        </table>
      </ReportFrame>,
    );
    const head = screen.getByTestId('redesign-report-head');
    expect(head.textContent).not.toContain('Wie lief der Monat?');
    expect(head.textContent).toContain('Monatsbericht');
    expect(screen.getByRole('group', { name: 'Berechnung Planabweichung' }).textContent).toContain(
      '50,00 €',
    );
    expect(screen.getByTestId('report-frame-result').textContent).toBe('−15,00 €');
    expect(screen.getByRole('button', { name: 'August' })).toBeTruthy();
    expect(head.contains(screen.getByRole('button', { name: 'Darstellung' }))).toBe(true);
    expect(screen.getByTestId('report-frame-source').textContent).toContain('31.08.2026');
    const detail = screen.getByText('Berechnung und Einordnung').closest('details')!;
    fireEvent.click(screen.getByText('Berechnung und Einordnung'));
    expect(detail.open).toBe(true);
    expect(screen.getByText('Wie lief der Monat?')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Quelldaten' })).toBeTruthy();
    act(() => setAmountsHidden(true));
    expect(head.textContent).not.toContain('50,00');
    expect(screen.getByTestId('report-frame-result').textContent).toBe('••• €');
  });
  it('keeps missing metrics separate from zero and OFF delegates its exact legacy layout', () => {
    const view = render(<ReportFrame {...props} calculation={undefined} />);
    expect(screen.getByTestId('report-frame-result').textContent).toBe('—');
    view.rerender(
      <ReportFrame
        {...props}
        calculation={{ ...props.calculation, result: { ...props.calculation.result, value: 0 } }}
      />,
    );
    expect(screen.getByTestId('report-frame-result').textContent).toBe('0,00 €');
    view.rerender(
      <ReportFrame
        {...props}
        verdict={{
          reportId: 'onepager',
          period: '2026-08',
          unavailable: true,
          metric: { label: 'Gespart', unit: 'money', value: 0 },
        }}
      />,
    );
    expect(screen.getByTestId('report-frame-result').textContent).toBe('—');
    expect(screen.queryByRole('group', { name: 'Berechnung Planabweichung' })).toBeNull();
    flag.REDESIGN_ENABLED = false;
    view.rerender(
      <ReportFrame {...props}>
        <p>Unveränderter Report</p>
      </ReportFrame>,
    );
    expect(screen.queryByTestId('redesign-report-head')).toBeNull();
    expect(screen.getByTestId('legacy-frame').textContent).toBe('Unveränderter Report');
  });
});

function Sections({ reverse = false }: { reverse?: boolean }) {
  const ref = useCollapsibleSections('synthetic');
  const items = reverse
    ? ['Zweiter Abschnitt', 'Erster Abschnitt']
    : ['Erster Abschnitt', 'Zweiter Abschnitt'];
  return (
    <div ref={ref}>
      {items.map((name) => (
        <section key={name}>
          <h2>{name}</h2>
          <p>Inhalt {name}</p>
        </section>
      ))}
    </div>
  );
}
it('ON restores a stable section after reordering without consuming old positional preferences or other views', () => {
  window.history.pushState({}, '', '/reports/synthetic?darstellung=bilanz');
  localStorage.setItem('budget.report-sections./reports/synthetic', '["#0"]');
  const view = render(<Sections />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Abschnitt ein- oder ausklappen Zweiter Abschnitt' }),
  );
  const identity = reportSectionId('synthetic', 'Zweiter Abschnitt');
  expect(
    JSON.parse(
      localStorage.getItem('budget.report-sections.v2./reports/synthetic?darstellung=bilanz')!,
    ),
  ).toEqual([identity]);
  view.unmount();
  const again = render(<Sections reverse />);
  expect(
    screen
      .getByRole('button', { name: 'Abschnitt ein- oder ausklappen Zweiter Abschnitt' })
      .getAttribute('aria-expanded'),
  ).toBe('false');
  expect(
    screen
      .getByRole('button', { name: 'Abschnitt ein- oder ausklappen Erster Abschnitt' })
      .getAttribute('aria-expanded'),
  ).toBe('true');
  again.unmount();
  window.history.pushState({}, '', '/reports/synthetic?darstellung=gesamt');
  render(<Sections />);
  expect(
    screen
      .getByRole('button', { name: 'Abschnitt ein- oder ausklappen Zweiter Abschnitt' })
      .getAttribute('aria-expanded'),
  ).toBe('true');
});
