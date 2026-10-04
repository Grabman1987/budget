// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BottomSheet, SidePanel, WideDialog } from './panel';
import { Registers } from './registers';
import { Count } from './stamps';
import { Switch } from './switch';

describe('Count', () => {
  it('reads an alert count as "offen" for screen readers, not by colour alone', () => {
    render(<Count tone="alert">2</Count>);
    const badge = document.querySelector('.count') as HTMLElement;
    expect(badge.className).toContain('count-alert');
    expect(badge.textContent).toBe('2 offen');
    expect(badge.querySelector('.sr-only')?.textContent).toBe(' offen');
  });

  it('adds no hidden text to the neutral count', () => {
    render(<Count>12</Count>);
    expect(document.querySelector('.count')?.textContent).toBe('12');
    expect(document.querySelector('.count .sr-only')).toBeNull();
  });

  it('lets callers set or suppress the hidden suffix', () => {
    const { rerender } = render(
      <Count tone="alert" srSuffix=" ungelesen">
        3
      </Count>,
    );
    expect(document.querySelector('.count')?.textContent).toBe('3 ungelesen');
    rerender(
      <Count tone="alert" srSuffix="">
        3
      </Count>,
    );
    expect(document.querySelector('.count .sr-only')).toBeNull();
  });
});

describe('Registers', () => {
  const items = [
    { id: 'monat', label: 'Monat' },
    { id: 'jahr', label: 'Jahr' },
  ];

  it('button variant uses aria-pressed, not aria-current', async () => {
    const onSelect = vi.fn();
    render(<Registers label="Plan" current="monat" items={items} onSelect={onSelect} />);
    const monat = screen.getByRole('button', { name: 'Monat' });
    const jahr = screen.getByRole('button', { name: 'Jahr' });
    expect(monat.getAttribute('aria-pressed')).toBe('true');
    expect(jahr.getAttribute('aria-pressed')).toBe('false');
    expect(monat.hasAttribute('aria-current')).toBe(false);
    await userEvent.click(jahr);
    expect(onSelect).toHaveBeenCalledWith('jahr');
  });

  it('link variants keep aria-current="page"', () => {
    render(
      <Registers
        label="Plan"
        current="jahr"
        items={[
          { id: 'monat', label: 'Monat', href: '/m' },
          { id: 'jahr', label: 'Jahr', href: '/j' },
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Jahr' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Monat' }).hasAttribute('aria-pressed')).toBe(false);
  });
});

describe('Switch', () => {
  it('is named by label', () => {
    render(<Switch label="Automatisch" checked onChange={() => {}} />);
    expect(screen.getByRole('switch', { name: 'Automatisch' })).toBeTruthy();
  });

  it('is named by an element referenced with labelledBy', () => {
    render(
      <>
        <span id="lbl">Benachrichtigungen</span>
        <Switch labelledBy="lbl" checked={false} onChange={() => {}} />
      </>,
    );
    const sw = screen.getByRole('switch', { name: 'Benachrichtigungen' });
    expect(sw.getAttribute('aria-labelledby')).toBe('lbl');
    expect(sw.hasAttribute('aria-label')).toBe(false);
  });
});

describe('Overlay panels', () => {
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['side panel', SidePanel],
    ['bottom sheet', BottomSheet],
  ])('%s is labelled by its visible heading', async (_name, Panel) => {
    render(
      <Panel open onClose={() => {}} title="Kontostand prüfen">
        <p>inhalt</p>
      </Panel>,
    );
    await act(async () => {});
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    const heading = screen.getByRole('heading', { level: 2, name: 'Kontostand prüfen' });
    expect(dialog.getAttribute('aria-labelledby')).toBe(heading.id);
    expect(heading.id).not.toBe('');
    expect(dialog.hasAttribute('aria-label')).toBe(false);
  });

  it('gives two panels distinct heading ids', async () => {
    render(
      <>
        <SidePanel open onClose={() => {}} title="A">
          a
        </SidePanel>
        <SidePanel open onClose={() => {}} title="B">
          b
        </SidePanel>
      </>,
    );
    await act(async () => {});
    const ids = screen.getAllByRole('heading', { level: 2 }).map((h) => h.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('WideDialog', () => {
  const stubPhone = (phone: boolean) =>
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: phone && query.includes('max-width: 767px'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is a wide centred modal on desktop, named by its heading, with head aside and close', async () => {
    stubPhone(false);
    const onClose = vi.fn();
    render(
      <WideDialog open onClose={onClose} title="Posteingang" headAside={<span>3 offen</span>}>
        <p>inhalt</p>
      </WideDialog>,
    );
    await act(async () => {});
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.classList.contains('modal')).toBe(true);
    expect(dialog.classList.contains('is-wide')).toBe(true);
    expect(dialog.classList.contains('is-full')).toBe(false);
    const heading = screen.getByRole('heading', { level: 2, name: 'Posteingang' });
    expect(dialog.getAttribute('aria-labelledby')).toBe(heading.id);
    // The aside sits in the head, outside the heading, so the dialog name stays "Posteingang".
    expect(heading.closest('.panel-head')?.textContent).toContain('3 offen');
    expect(heading.textContent).toBe('Posteingang');
    await userEvent.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes with Escape and with a click on the backdrop, but not on a click inside', async () => {
    stubPhone(false);
    const onClose = vi.fn();
    render(
      <WideDialog open onClose={onClose} title="Posteingang">
        <p>inhalt</p>
      </WideDialog>,
    );
    await act(async () => {});
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    await userEvent.click(screen.getByText('inhalt'));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('becomes a full-screen sheet below 768 px', async () => {
    stubPhone(true);
    render(
      <WideDialog open onClose={() => {}} title="Posteingang">
        <p>inhalt</p>
      </WideDialog>,
    );
    await act(async () => {});
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.classList.contains('sheet-bottom')).toBe(true);
    expect(dialog.classList.contains('is-full')).toBe(true);
    expect(dialog.classList.contains('is-wide')).toBe(false);
  });
});
