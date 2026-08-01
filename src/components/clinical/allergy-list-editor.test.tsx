import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { AllergyListEditor } from './allergy-list-editor';
import type { Allergy } from '@/lib/clinical/clinical-types';

function Harness() {
  const [v, setV] = useState<Allergy[]>([]);
  return <><AllergyListEditor value={v} onChange={setV} /><output data-testid="n">{v.length}</output>
    <output data-testid="first">{v[0] ? `${v[0].alergeno}|${v[0].tipo}|${v[0].severidad}|${v[0].esAlerta}` : ''}</output></>;
}

it('agrega una fila, edita sus campos y la quita', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: /agregar alergia/i }));
  expect(screen.getByTestId('n')).toHaveTextContent('1');
  await user.type(screen.getByLabelText(/alérgeno/i), 'Penicilina');
  await user.selectOptions(screen.getByLabelText(/tipo/i), 'MEDICAMENTO');
  await user.selectOptions(screen.getByLabelText(/severidad/i), 'ANAFILAXIA');
  await user.click(screen.getByLabelText(/marcar como alerta/i));
  expect(screen.getByTestId('first')).toHaveTextContent('Penicilina|MEDICAMENTO|ANAFILAXIA|true');
  await user.click(screen.getByRole('button', { name: /quitar alergia/i }));
  expect(screen.getByTestId('n')).toHaveTextContent('0');
});
