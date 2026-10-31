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
