import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Switch } from './switch';

test('es un checkbox nativo con role="switch"', async () => {
  const user = userEvent.setup();
  const onChange = jest.fn();
  render(<Switch label="Recordatorios por WhatsApp" description="Un día antes de la cita" onChange={onChange} />);
  const sw = screen.getByRole('switch', { name: 'Recordatorios por WhatsApp' });
  expect(sw).toHaveAttribute('type', 'checkbox');
  expect(sw).toHaveAccessibleDescription('Un día antes de la cita');
  expect(sw).not.toBeChecked();
  await user.click(screen.getByText('Recordatorios por WhatsApp'));
  expect(sw).toBeChecked();
  expect(onChange).toHaveBeenCalledTimes(1);
});

test('la pista apagada es visible (border-input), encendida es el acento', () => {
  render(<Switch aria-label="Modo oscuro" />);
  const sw = screen.getByRole('switch', { name: 'Modo oscuro' });
  expect(sw).toHaveClass('bg-border-input', 'checked:bg-primary', 'h-5', 'w-9');
});

test('controlado y con ref', async () => {
  const user = userEvent.setup();
  const ref = React.createRef<HTMLInputElement>();
  function Harness() {
    const [on, setOn] = React.useState(true);
    return <Switch ref={ref} label="Activo" checked={on} onChange={(e) => setOn(e.target.checked)} />;
  }
  render(<Harness />);
  const sw = screen.getByRole('switch', { name: 'Activo' });
  expect(ref.current).toBe(sw);
  expect(sw).toBeChecked();
  await user.click(sw);
  expect(sw).not.toBeChecked();
});
