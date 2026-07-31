import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ConditionChecklist } from './condition-checklist';
import type { Condition } from '@/lib/clinical/clinical-types';

function Harness() {
  const [v, setV] = useState<Condition[]>([]);
  return <><ConditionChecklist value={v} onChange={setV} /><output data-testid="n">{v.length}</output>
    <output data-testid="found">{v.find((c) => c.codigo === 'DIABETES') ? `${v.find((c) => c.codigo === 'DIABETES')!.codigo}|${v.find((c) => c.codigo === 'DIABETES')!.estado}` : ''}</output>
    <output data-testid="all">{JSON.stringify(v)}</output></>;
}

it('marca una condición como Sí y la emite en el value', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  expect(screen.getByTestId('n')).toHaveTextContent('0');
  await user.selectOptions(screen.getByRole('combobox', { name: /diabetes/i }), 'SI');
  expect(screen.getByTestId('found')).toHaveTextContent('DIABETES|SI');
  await user.selectOptions(screen.getByRole('combobox', { name: /diabetes/i }), 'NO');
  expect(screen.getByTestId('n')).toHaveTextContent('0');
});

it('conserva la nota escrita en una condición aunque su estado quede en NO', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const nota = screen.getByRole('textbox', { name: /hipertensión/i });
  await user.type(nota, 'Controlada con medicación');
  expect(nota).toHaveValue('Controlada con medicación');
  const all: Condition[] = JSON.parse(screen.getByTestId('all').textContent ?? '[]');
  const row = all.find((c) => c.codigo === 'HIPERTENSION');
  expect(row?.estado).toBe('NO');
  expect(row?.nota).toBe('Controlada con medicación');
});
