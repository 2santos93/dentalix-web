import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ClinicalHistoryFields } from './clinical-history-fields';
import type { ClinicalHistoryValue } from '@/lib/clinical/clinical-types';

function Harness({ sections }: { sections?: Array<'conditions' | 'allergies' | 'medications' | 'habits'> }) {
  const [v, setV] = useState<ClinicalHistoryValue>({});
  return (
    <>
      <ClinicalHistoryFields value={v} onChange={setV} sections={sections} />
      <output data-testid="allergies-count">{v.allergies?.length ?? 0}</output>
      <output data-testid="embarazo">{String(v.embarazo ?? false)}</output>
      <output data-testid="semanas">{v.semanasEmbarazo ?? ''}</output>
      <output data-testid="notes">{v.notes ?? ''}</output>
    </>
  );
}

it('agrega una alergia vía el editor embebido y la refleja en el value del padre', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: /agregar alergia/i }));
  expect(screen.getByTestId('allergies-count')).toHaveTextContent('1');
});

it('marca embarazo y lo refleja en el value del padre, mostrando semanas', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByLabelText(/embarazo/i));
  expect(screen.getByTestId('embarazo')).toHaveTextContent('true');
  await user.type(screen.getByLabelText(/semanas de embarazo/i), '12');
  expect(screen.getByTestId('semanas')).toHaveTextContent('12');
});

it('escribe notas y las refleja en el value del padre', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.type(screen.getByLabelText(/notas/i), 'Paciente colabora bien');
  expect(screen.getByTestId('notes')).toHaveTextContent('Paciente colabora bien');
});

it('respeta la prop sections, renderizando solo las secciones pedidas', () => {
  render(<Harness sections={['allergies']} />);
  expect(screen.getByRole('button', { name: /agregar alergia/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /agregar medicamento/i })).not.toBeInTheDocument();
});
