import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateField, TimeField } from './date-field';
import { DateLocaleProvider } from './date-locale';
import { FormField } from '@/components/shared/form-field';

function segmentTypes(group: HTMLElement): string[] {
  return within(group)
    .getAllByRole('spinbutton')
    .map((el) => el.getAttribute('data-type') ?? '');
}

function ControlledDate(props: { initial?: string | null; showAge?: boolean; onValue?: (v: string | null) => void }) {
  const [value, setValue] = useState<string | null>(props.initial ?? null);
  return (
    <form aria-label="f">
      <FormField htmlFor="dob" label="Fecha de nacimiento">
        <DateField
          id="dob"
          name="birthDate"
          value={value}
          showAge={props.showAge}
          onChange={(v) => {
            setValue(v);
            props.onValue?.(v);
          }}
        />
      </FormField>
    </form>
  );
}

describe('DateField', () => {
  it('se nombra con la etiqueta del FormField y ordena los segmentos dd/mm/aaaa en español', () => {
    render(<ControlledDate />);
    const group = screen.getByRole('group', { name: 'Fecha de nacimiento' });
    expect(segmentTypes(group)).toEqual(['day', 'month', 'year']);
  });

  it('sigue el locale de la sede, no el del navegador (en-US: mm/dd/yyyy)', () => {
    render(
      <DateLocaleProvider locale="en-US">
        <ControlledDate />
      </DateLocaleProvider>,
    );
    expect(segmentTypes(screen.getByRole('group', { name: 'Fecha de nacimiento' }))).toEqual(['month', 'day', 'year']);
  });

  it('escribir 05/04/1990 da el ISO 1990-04-05, la edad y el hidden input', async () => {
    const user = userEvent.setup();
    const onValue = jest.fn();
    render(<ControlledDate showAge onValue={onValue} />);
    const [day] = within(screen.getByRole('group', { name: 'Fecha de nacimiento' })).getAllByRole('spinbutton');
    await user.click(day);
    await user.keyboard('05041990');
    expect(onValue).toHaveBeenLastCalledWith('1990-04-05');
    expect(screen.getByTestId('date-field-age').textContent).toMatch(/^\d+ años$/);
    expect(new FormData(screen.getByRole('form') as HTMLFormElement).get('birthDate')).toBe('1990-04-05');
  });

  it('pinta un valor ISO inicial y lo envía tal cual', () => {
    render(<ControlledDate initial="2000-12-31" showAge />);
    const group = screen.getByRole('group', { name: 'Fecha de nacimiento' });
    expect(within(group).getAllByRole('spinbutton').map((s) => s.textContent)).toEqual(['31', '12', '2000']);
    expect(new FormData(screen.getByRole('form') as HTMLFormElement).get('birthDate')).toBe('2000-12-31');
  });

  it('siempre con dos cifras: 05/01/2000, no 5/1/2000', () => {
    render(<ControlledDate initial="2000-01-05" />);
    const group = screen.getByRole('group', { name: 'Fecha de nacimiento' });
    expect(within(group).getAllByRole('spinbutton').map((s) => s.textContent)).toEqual(['05', '01', '2000']);
  });

  it('marca el estado inválido con aria-invalid', () => {
    render(<DateField id="x" aria-label="Fecha" value={null} onChange={() => {}} aria-invalid />);
    expect(screen.getByRole('group', { name: 'Fecha' })).toHaveAttribute('data-invalid');
  });
});

describe('TimeField', () => {
  function ControlledTime({ onValue }: { onValue: (v: string | null) => void }) {
    const [value, setValue] = useState<string | null>(null);
    return (
      <form aria-label="t">
        <TimeField
          label="Hora"
          name="time"
          value={value}
          onChange={(v) => {
            setValue(v);
            onValue(v);
          }}
        />
      </form>
    );
  }

  it('con reloj de 24 h, escribir 0930 da 09:30', async () => {
    const user = userEvent.setup();
    const onValue = jest.fn();
    render(
      <DateLocaleProvider locale="es-VE" hourCycle="h23">
        <ControlledTime onValue={onValue} />
      </DateLocaleProvider>,
    );
    const [hour] = within(screen.getByRole('group', { name: 'Hora' })).getAllByRole('spinbutton');
    await user.click(hour);
    await user.keyboard('0930');
    expect(onValue).toHaveBeenLastCalledWith('09:30');
    expect(new FormData(screen.getByRole('form') as HTMLFormElement).get('time')).toBe('09:30');
  });

  it('con reloj de 12 h muestra a. m./p. m. y guarda en 24 h', async () => {
    const user = userEvent.setup();
    const onValue = jest.fn();
    render(
      <DateLocaleProvider locale="es-VE" hourCycle="h12">
        <ControlledTime onValue={onValue} />
      </DateLocaleProvider>,
    );
    const group = screen.getByRole('group', { name: 'Hora' });
    expect(segmentTypes(group)).toContain('dayPeriod');
    const [hour] = within(group).getAllByRole('spinbutton');
    await user.click(hour);
    await user.keyboard('0315p');
    expect(onValue).toHaveBeenLastCalledWith('15:15');
  });
});
