import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ConditionChecklist } from './condition-checklist';
import { STANDARD_CONDITIONS, type Condition } from '@/lib/clinical/clinical-types';

function Harness({ initial = [] }: { initial?: Condition[] }) {
  const [v, setV] = useState<Condition[]>(initial);
  return (
    <>
      <ConditionChecklist value={v} onChange={setV} />
      <output data-testid="all">{JSON.stringify(v)}</output>
    </>
  );
}

const emitted = (): Condition[] => JSON.parse(screen.getByTestId('all').textContent ?? '[]');
const group = (name: RegExp) => screen.getByRole('radiogroup', { name });

it('cada condición empieza «Sin responder», nada se emite como «No»', () => {
  render(<Harness />);
  const groups = screen.getAllByRole('radiogroup');
  expect(groups).toHaveLength(STANDARD_CONDITIONS.length);
  for (const g of groups) {
    expect(within(g).getByRole('radio', { name: 'Sin responder' })).toBeChecked();
    expect(within(g).getByRole('radio', { name: 'No' })).not.toBeChecked();
  }
  expect(emitted()).toEqual([]);
  expect(screen.getByText(`${STANDARD_CONDITIONS.length} sin responder`)).toBeInTheDocument();
});

it('Sí, No y No sabe se guardan explícitos; «Sin responder» quita la fila', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const diabetes = group(/^diabetes$/i);
  await user.click(within(diabetes).getByRole('radio', { name: 'Sí' }));
  expect(emitted()).toEqual([expect.objectContaining({ codigo: 'DIABETES', estado: 'SI' })]);
  await user.click(within(diabetes).getByRole('radio', { name: 'No' }));
  expect(emitted()).toEqual([expect.objectContaining({ codigo: 'DIABETES', estado: 'NO' })]);
  await user.click(within(diabetes).getByRole('radio', { name: 'No sabe' }));
  expect(emitted()).toEqual([expect.objectContaining({ codigo: 'DIABETES', estado: 'DESCONOCE' })]);
  await user.click(within(diabetes).getByRole('radio', { name: 'Sin responder' }));
  expect(emitted()).toEqual([]);
});

it('la nota aparece al contestar y se conserva al cambiar la respuesta', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  expect(screen.queryByRole('textbox', { name: /hipertensión/i })).not.toBeInTheDocument();
  const hta = group(/^hipertensión$/i);
  await user.click(within(hta).getByRole('radio', { name: 'Sí' }));
  const nota = screen.getByRole('textbox', { name: /hipertensión/i });
  await user.type(nota, 'Controlada con medicación');
  expect(nota).toHaveValue('Controlada con medicación');
  await user.click(within(hta).getByRole('radio', { name: 'No' }));
  expect(emitted()).toEqual([
    expect.objectContaining({ codigo: 'HIPERTENSION', estado: 'NO', nota: 'Controlada con medicación' }),
  ]);
});

it('una versión previa sin una condición la muestra «Sin responder», no «No»', () => {
  render(<Harness initial={[{ codigo: 'ASMA', etiqueta: 'Asma / respiratorio', estado: 'NO', esAlerta: false }]} />);
  expect(within(group(/^asma/i)).getByRole('radio', { name: 'No' })).toBeChecked();
  expect(within(group(/^diabetes$/i)).getByRole('radio', { name: 'Sin responder' })).toBeChecked();
  expect(screen.getByText('1 No')).toBeInTheDocument();
  expect(screen.getByText(`${STANDARD_CONDITIONS.length - 1} sin responder`)).toBeInTheDocument();
});
