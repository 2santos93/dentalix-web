import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppointmentStatusSelect } from './appointment-status-select';
import type { AppointmentStatus } from '@/lib/appointments/appointments-api';

const OPTIONS: AppointmentStatus[] = ['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

function setup(props: Partial<React.ComponentProps<typeof AppointmentStatusSelect>> = {}) {
  const onChange = jest.fn();
  const user = userEvent.setup();
  render(
    <AppointmentStatusSelect
      label="Estado de la cita de 09:00–09:30"
      value="SCHEDULED"
      options={OPTIONS}
      onChange={onChange}
      {...props}
    />,
  );
  const trigger = screen.getByRole('combobox', { name: /Estado de la cita de 09:00–09:30/ });
  return { onChange, user, trigger };
}

// DX-295: con el `<select>` nativo, ↓ sobre el control cerrado cambiaba la
// cita en el acto. Ahora las flechas solo abren la lista y mueven la opción
// enfocada; el cambio sale con Enter o con un clic en una opción.
describe('AppointmentStatusSelect (DX-295)', () => {
  it('anuncia el estado actual en el nombre del control', () => {
    const { trigger } = setup({ value: 'CONFIRMED' });
    expect(trigger).toHaveAccessibleName('Estado de la cita de 09:00–09:30: Confirmada');
    expect(trigger).toHaveTextContent('Confirmada');
  });

  it('↑/↓ sobre el control cerrado abren la lista sin cambiar el estado', async () => {
    const { onChange, user, trigger } = setup();
    trigger.focus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    // La lista abre con el foco en el estado actual.
    expect(screen.getByRole('option', { name: 'Agendada' })).toHaveFocus();

    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}{ArrowDown}');
    expect(screen.getByRole('option', { name: 'Completada' })).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();

    // Esc cierra sin aplicar nada y devuelve el foco al control.
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveTextContent('Agendada');
    expect(onChange).not.toHaveBeenCalled();

    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('una letra sobre el control cerrado no cambia el estado (sin búsqueda al teclear)', async () => {
    const { onChange, user, trigger } = setup();
    trigger.focus();
    await user.keyboard('cnC');
    expect(onChange).not.toHaveBeenCalled();
    expect(trigger).toHaveTextContent('Agendada');
  });

  it('Enter sobre la opción enfocada aplica ese estado', async () => {
    const { onChange, user, trigger } = setup();
    trigger.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(screen.getByRole('option', { name: 'Confirmada' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('CONFIRMED');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('un clic en una opción aplica ese estado', async () => {
    const { onChange, user, trigger } = setup();
    await user.click(trigger);
    await user.click(screen.getByRole('option', { name: 'No asistió' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('NO_SHOW');
  });

  it('elegir el estado que ya tiene no envía nada', async () => {
    const { onChange, user, trigger } = setup();
    trigger.focus();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ofrece solo las opciones que recibe, en su orden', async () => {
    const { user, trigger } = setup({ value: 'ARRIVED', options: ['ARRIVED', 'COMPLETED', 'CANCELLED'] });
    await user.click(trigger);
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'En espera',
      'Completada',
      'Cancelada',
    ]);
  });

  it('deshabilitado no abre la lista', async () => {
    const { onChange, user, trigger } = setup({ disabled: true });
    expect(trigger).toBeDisabled();
    await user.click(trigger);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  // QA DX-295 (DEF-1): mientras se guarda el control queda deshabilitado y el
  // navegador le quita el foco; al terminar se le devuelve.
  function SavingHarness() {
    const [value, setValue] = useState<AppointmentStatus>('SCHEDULED');
    const [saving, setSaving] = useState(false);
    return (
      <>
        <AppointmentStatusSelect
          label="Estado de la cita de 09:00–09:30"
          value={value}
          options={OPTIONS}
          disabled={saving}
          onChange={(next) => {
            setSaving(true);
            setValue(next);
          }}
        />
        <button type="button">Motivo</button>
        <button type="button" onClick={() => setSaving(false)}>
          Terminar guardado
        </button>
      </>
    );
  }

  it('al terminar el guardado devuelve el foco al control', async () => {
    const user = userEvent.setup();
    render(<SavingHarness />);
    const trigger = screen.getByRole('combobox', { name: /Estado de la cita/ });
    trigger.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    // jsdom no quita el foco a un botón deshabilitado; el navegador sí.
    trigger.blur();

    screen.getByText('Terminar guardado').click();
    expect(await screen.findByRole('combobox', { name: /Confirmada/ })).toHaveFocus();
  });

  it('no roba el foco si quedó en otro control (p. ej. un diálogo de motivo)', async () => {
    const user = userEvent.setup();
    render(<SavingHarness />);
    const trigger = screen.getByRole('combobox', { name: /Estado de la cita/ });
    trigger.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    const motivo = screen.getByText('Motivo');
    motivo.focus();
    expect(motivo).toHaveFocus();

    screen.getByText('Terminar guardado').click();
    await screen.findByRole('combobox', { name: /Confirmada/ });
    expect(motivo).toHaveFocus();
  });
});
