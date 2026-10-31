import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { today, getLocalTimeZone, startOfMonth } from '@internationalized/date';
import { DatePicker, DateRangePicker } from './date-picker';
import { DateLocaleProvider } from './date-locale';
import { FormField } from '@/components/shared/form-field';
import type { IsoRange } from '@/lib/dates/iso';

describe('DatePicker', () => {
  function Controlled({ onValue, initial = null }: { onValue: (v: string | null) => void; initial?: string | null }) {
    const [value, setValue] = useState<string | null>(initial);
    return (
      <FormField htmlFor="appt-day" label="Día de la cita">
        <DatePicker
          id="appt-day"
          value={value}
          onChange={(v) => {
            setValue(v);
            onValue(v);
          }}
        />
      </FormField>
    );
  }

  it('se puede escribir y devuelve ISO', async () => {
    const user = userEvent.setup();
    const onValue = jest.fn();
    render(<Controlled onValue={onValue} />);
    const group = screen.getByRole('group', { name: 'Día de la cita' });
    await user.click(within(group).getAllByRole('spinbutton')[0]);
    await user.keyboard('30102026');
    expect(onValue).toHaveBeenLastCalledWith('2026-10-30');
  });

  it('no emite años parciales y Enter en un segmento envía el formulario', async () => {
    const user = userEvent.setup();
    const onValue = jest.fn();
    const onSubmit = jest.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form aria-label="f" onSubmit={onSubmit}>
        <Controlled onValue={onValue} />
      </form>,
    );
    const group = screen.getByRole('group', { name: 'Día de la cita' });
    await user.click(within(group).getAllByRole('spinbutton')[0]);
    await user.keyboard('0510202');
    expect(onValue.mock.calls.every(([v]) => v === null)).toBe(true);
    await user.keyboard('6');
    expect(onValue).toHaveBeenLastCalledWith('2026-10-05');
    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('el calendario (en español, semana desde el lunes) elige un día', async () => {
    const user = userEvent.setup();
    const onValue = jest.fn();
    render(<Controlled onValue={onValue} initial="2026-10-30" />);
    await user.click(screen.getByRole('button', { name: /calendario/i }));
    const dialog = await screen.findByRole('dialog');
    const days = within(dialog).getAllByRole('button', { name: /de 2026$/ });
    expect(days[0]).toHaveAccessibleName(/^lunes,/);
    expect(within(dialog).getByRole('heading').textContent?.toLowerCase()).toContain('octubre');
    await user.click(within(dialog).getByRole('button', { name: /12 de octubre de 2026/i }));
    expect(onValue).toHaveBeenLastCalledWith('2026-10-12');
  });
});

describe('DateRangePicker', () => {
  function Controlled({ onValue, initial = null }: { onValue: (v: IsoRange | null) => void; initial?: IsoRange | null }) {
    const [value, setValue] = useState<IsoRange | null>(initial);
    return (
      <form aria-label="f">
        <FormField htmlFor="period" label="Periodo">
          <DateRangePicker
            id="period"
            startName="from"
            endName="to"
            presets
            value={value}
            onChange={(v) => {
              setValue(v);
              onValue(v);
            }}
          />
        </FormField>
      </form>
    );
  }

  it('cada extremo se llama Desde/Hasta y se escribe por segmentos', async () => {
    const user = userEvent.setup();
    const onValue = jest.fn();
    render(<Controlled onValue={onValue} initial={{ from: '2026-10-01', to: '2026-10-30' }} />);
    const group = screen.getByRole('group', { name: 'Periodo' });
    const from = within(group).getAllByRole('spinbutton', { name: /Desde/ });
    const to = within(group).getAllByRole('spinbutton', { name: /Hasta/ });
    expect(from[0]).toHaveAccessibleName('día, Desde, Periodo');
    await user.click(from[0]);
    await user.keyboard('05');
    expect(onValue).toHaveBeenLastCalledWith({ from: '2026-10-05', to: '2026-10-30' });
    expect(to.map((s) => s.textContent)).toEqual(['30', '10', '2026']);
    const data = new FormData(screen.getByRole('form') as HTMLFormElement);
    expect([data.get('from'), data.get('to')]).toEqual(['2026-10-05', '2026-10-30']);
  });

  it('un año a medias en un extremo da null, no un periodo con 0002', async () => {
    const user = userEvent.setup();
    const onValue = jest.fn();
    render(<Controlled onValue={onValue} initial={{ from: '2026-10-01', to: '2026-10-30' }} />);
    const year = within(screen.getByRole('group', { name: 'Periodo' })).getAllByRole('spinbutton', { name: /Desde/ })[2];
    await user.click(year);
    await user.keyboard('{Backspace}{Backspace}{Backspace}{Backspace}202');
    expect(onValue.mock.calls.every(([v]) => v === null)).toBe(true);
    await user.keyboard('5');
    expect(onValue).toHaveBeenLastCalledWith({ from: '2025-10-01', to: '2026-10-30' });
  });

  it('el atajo «Este mes» aplica del 1 a hoy en la zona de la sede', async () => {
    const user = userEvent.setup();
    const onValue = jest.fn();
    render(
      <DateLocaleProvider locale="es-VE" timeZone="America/Caracas">
        <Controlled onValue={onValue} initial={{ from: '2026-01-01', to: '2026-01-02' }} />
      </DateLocaleProvider>,
    );
    await user.click(screen.getByRole('button', { name: /calendario/i }));
    const dialog = await screen.findByRole('dialog');
    // En teléfono (jsdom no tiene matchMedia: vista estrecha) es una hoja con el nombre del campo.
    expect(within(dialog).getByText('Periodo')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Este mes' }));
    const t = today('America/Caracas');
    expect(onValue).toHaveBeenLastCalledWith({ from: startOfMonth(t).toString(), to: t.toString() });
    expect(getLocalTimeZone()).toBeTruthy();
  });
});
