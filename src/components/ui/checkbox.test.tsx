import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox } from './checkbox';

test('es un checkbox real con etiqueta: toda la fila lo marca', async () => {
  const user = userEvent.setup();
  render(<Checkbox label="Fumador" description="Más de 5 cigarrillos al día" />);
  const box = screen.getByRole('checkbox', { name: 'Fumador' });
  expect(box).toHaveAttribute('type', 'checkbox');
  expect(box).toHaveAccessibleDescription('Más de 5 cigarrillos al día');
  expect(box).not.toBeChecked();
  await user.click(screen.getByText('Más de 5 cigarrillos al día'));
  expect(box).toBeChecked();
});

test('el nombre accesible es solo la etiqueta, no la descripción', () => {
  render(<Checkbox label="Alergias" description="Látex, penicilina…" />);
  expect(screen.getByRole('checkbox')).toHaveAccessibleName('Alergias');
});

test('controlado: onChange y checked', async () => {
  const user = userEvent.setup();
  function Harness() {
    const [checked, setChecked] = React.useState(false);
    return <Checkbox label="Acepto" checked={checked} onChange={(e) => setChecked(e.target.checked)} />;
  }
  render(<Harness />);
  const box = screen.getByRole('checkbox', { name: 'Acepto' });
  await user.click(box);
  expect(box).toBeChecked();
  await user.keyboard(' ');
  expect(box).not.toBeChecked();
});

test('indeterminate se anuncia como mixto y la ref llega al input', () => {
  const ref = React.createRef<HTMLInputElement>();
  const { rerender } = render(<Checkbox ref={ref} aria-label="Todas las sedes" indeterminate />);
  expect(ref.current?.indeterminate).toBe(true);
  expect(screen.getByRole('checkbox', { name: 'Todas las sedes' })).toBePartiallyChecked();
  rerender(<Checkbox ref={ref} aria-label="Todas las sedes" indeterminate={false} />);
  expect(ref.current?.indeterminate).toBe(false);
});

test('error: InlineError con fieldErrorId, aria-invalid y descrito', () => {
  render(<Checkbox id="consent" label="Consentimiento firmado" error="Falta el consentimiento." />);
  const box = screen.getByRole('checkbox', { name: 'Consentimiento firmado' });
  expect(box).toBeInvalid();
  expect(box).toHaveAccessibleDescription('Falta el consentimiento.');
  expect(document.getElementById('consent-error')).toHaveTextContent('Falta el consentimiento.');
});

test('desactivado no cambia', async () => {
  const user = userEvent.setup();
  render(<Checkbox label="Bloqueado" disabled />);
  const box = screen.getByRole('checkbox', { name: 'Bloqueado' });
  await user.click(box);
  expect(box).not.toBeChecked();
  expect(box).toBeDisabled();
});

test('ganar o perder el error (o la descripción) no vuelve a montar el input: conserva el foco', () => {
  const { rerender } = render(<Checkbox id="c" label="Recurrente" className="sm:col-span-2" />);
  const box = screen.getByRole('checkbox', { name: 'Recurrente' });
  box.focus();
  rerender(<Checkbox id="c" label="Recurrente" className="sm:col-span-2" error="Marca la casilla" description="Cada año" />);
  expect(screen.getByRole('checkbox', { name: 'Recurrente' })).toBe(box);
  expect(box).toHaveFocus();
  expect(box).toHaveAccessibleDescription(/Cada año.*Marca la casilla/);
  // Con error, el envoltorio apila fila y mensaje y lleva la clase de layout.
  expect(box.closest('div')).toHaveClass('flex', 'flex-col', 'sm:col-span-2');
  rerender(<Checkbox id="c" label="Recurrente" className="sm:col-span-2" />);
  expect(screen.getByRole('checkbox')).toBe(box);
  expect(box).toHaveFocus();
  // Sin error, el envoltorio no cuenta para el layout y la clase va en la fila.
  expect(box.closest('div')).toHaveClass('contents');
  expect(box.closest('label')).toHaveClass('sm:col-span-2');
});

test('sin etiqueta tampoco se vuelve a montar al ganar el error', () => {
  const { rerender } = render(<Checkbox id="b" aria-label="Elegir" />);
  const box = screen.getByRole('checkbox', { name: 'Elegir' });
  box.focus();
  rerender(<Checkbox id="b" aria-label="Elegir" error="Obligatorio" />);
  expect(screen.getByRole('checkbox')).toBe(box);
  expect(box).toHaveFocus();
  expect(box).toHaveAccessibleDescription('Obligatorio');
});
