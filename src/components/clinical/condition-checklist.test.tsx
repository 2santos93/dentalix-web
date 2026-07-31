import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ConditionChecklist } from './condition-checklist';
import type { Condition } from '@/lib/clinical/clinical-types';

function Harness() {
  const [v, setV] = useState<Condition[]>([]);
  return <><ConditionChecklist value={v} onChange={setV} /><output data-testid="n">{v.length}</output>
    <output data-testid="found">{v.find((c) => c.codigo === 'DIABETES') ? `${v.find((c) => c.codigo === 'DIABETES')!.codigo}|${v.find((c) => c.codigo === 'DIABETES')!.estado}` : ''}</output></>;
}

it('marca una condición como Sí y la emite en el value', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  expect(screen.getByTestId('n')).toHaveTextContent('0');
  await user.selectOptions(screen.getByLabelText(/diabetes/i), 'SI');
  expect(screen.getByTestId('found')).toHaveTextContent('DIABETES|SI');
  await user.selectOptions(screen.getByLabelText(/diabetes/i), 'NO');
  expect(screen.getByTestId('n')).toHaveTextContent('0');
});
