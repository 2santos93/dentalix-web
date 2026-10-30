import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RadioCard, RadioGroup, RadioOption } from './radio-group';

test('grupo con leyenda y radios nativos con el mismo name', async () => {
  const user = userEvent.setup();
  const onValueChange = jest.fn();
  render(
    <RadioGroup id="dentition" legend="Dentición" defaultValue="permanent" onValueChange={onValueChange}>
      <RadioOption id="dentition" value="permanent" label="Permanente" />
      <RadioOption value="primary" label="Temporal" description="Hasta los 12 años" />
    </RadioGroup>,
  );
  expect(screen.getByRole('radiogroup', { name: 'Dentición' })).toBeInTheDocument();
  const permanent = screen.getByRole('radio', { name: 'Permanente' });
  const primary = screen.getByRole('radio', { name: 'Temporal' });
  expect(permanent).toHaveAttribute('id', 'dentition');
  expect(permanent).toHaveAttribute('name', 'dentition');
  expect(primary).toHaveAttribute('name', 'dentition');
  expect(primary).toHaveAccessibleDescription('Hasta los 12 años');
  expect(permanent).toBeChecked();
  await user.click(primary);
  expect(primary).toBeChecked();
  expect(permanent).not.toBeChecked();
  expect(onValueChange).toHaveBeenCalledWith('primary');
});

test('controlado con tarjetas: la seleccionada sigue al valor', async () => {
  const user = userEvent.setup();
  function Harness() {
    const [value, setValue] = React.useState<string | undefined>('');
    return (
      <RadioGroup id="hour-cycle" legend="Formato de hora" value={value} onValueChange={setValue} optionsClassName="grid grid-cols-2 gap-2">
        <RadioCard id="hour-cycle" value="h12" title="12 h" description="3:30 p. m." layout="inline" />
        <RadioCard value="h23" title="24 h" description="15:30" layout="inline" />
      </RadioGroup>
    );
  }
  render(<Harness />);
  const h12 = screen.getByRole('radio', { name: '12 h' });
  const h23 = screen.getByRole('radio', { name: '24 h' });
  expect(h23).toHaveAccessibleDescription('15:30');
  expect(h12).not.toBeChecked();
  await user.click(screen.getByText('15:30'));
  expect(h23).toBeChecked();
  // La tarjeta pinta el estado elegido con el borde y el fondo del acento.
  expect(h23.closest('label')).toHaveClass('has-checked:border-primary-border', 'has-checked:bg-primary-subtle');
  // Las flechas mueven la selección como en cualquier radio nativo.
  await user.keyboard('{ArrowLeft}');
  expect(h12).toBeChecked();
});

test('error: el grupo y cada opción quedan inválidos y describen el mensaje', () => {
  render(
    <RadioGroup id="hour-cycle" legend="Formato de hora" value="" required error="Elige el formato de hora.">
      <RadioCard id="hour-cycle" value="h12" title="12 h" />
      <RadioCard value="h23" title="24 h" />
    </RadioGroup>,
  );
  const group = screen.getByRole('radiogroup', { name: 'Formato de hora' });
  expect(group).toHaveAttribute('aria-invalid', 'true');
  expect(group).toHaveAttribute('aria-required', 'true');
  expect(group).toHaveAccessibleDescription('Elige el formato de hora.');
  for (const radio of screen.getAllByRole('radio')) {
    expect(radio).toBeInvalid();
    expect(radio).toBeRequired();
    expect(radio).toHaveAccessibleDescription('Elige el formato de hora.');
  }
  expect(document.getElementById('hour-cycle-error')).toHaveTextContent('Elige el formato de hora.');
});

test('la pista se describe mientras no hay error', () => {
  render(
    <RadioGroup id="kind" legend="Tipo" hint="Se puede cambiar luego.">
      <RadioOption value="a" label="A" />
    </RadioGroup>,
  );
  expect(screen.getByRole('radio', { name: 'A' })).toHaveAccessibleDescription('Se puede cambiar luego.');
});

test('un grupo desactivado desactiva sus radios', () => {
  render(
    <RadioGroup id="locked" legend="Bloqueado" disabled>
      <RadioOption value="a" label="A" />
    </RadioGroup>,
  );
  expect(screen.getByRole('radio', { name: 'A' })).toBeDisabled();
});

test('fuera de un RadioGroup avisa', () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  expect(() => render(<RadioOption value="a" label="A" />)).toThrow('<RadioOption> va dentro de <RadioGroup>.');
  jest.restoreAllMocks();
});
