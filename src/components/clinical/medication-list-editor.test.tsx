import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MedicationListEditor } from './medication-list-editor';
import type { Medication } from '@/lib/clinical/clinical-types';

function Harness() {
  const [v, setV] = useState<Medication[]>([]);
  return <><MedicationListEditor value={v} onChange={setV} /><output data-testid="n">{v.length}</output>
    <output data-testid="first">{v[0] ? `${v[0].nombre}|${v[0].dosis ?? ''}|${v[0].frecuencia ?? ''}|${v[0].motivo ?? ''}|${v[0].esAlerta}` : ''}</output></>;
}

it('agrega una fila, edita sus campos y la quita', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: /agregar medicamento/i }));
  expect(screen.getByTestId('n')).toHaveTextContent('1');
  await user.type(screen.getByLabelText(/medicamento/i), 'Warfarina');
  await user.type(screen.getByLabelText(/dosis/i), '5mg');
  await user.type(screen.getByLabelText(/frecuencia/i), 'Diaria');
  await user.type(screen.getByLabelText(/motivo/i), 'Anticoagulación');
  await user.click(screen.getByLabelText(/marcar como alerta/i));
  expect(screen.getByTestId('first')).toHaveTextContent('Warfarina|5mg|Diaria|Anticoagulación|true');
  await user.click(screen.getByRole('button', { name: /quitar medicamento/i }));
  expect(screen.getByTestId('n')).toHaveTextContent('0');
});
