import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { HabitsEditor } from './habits-editor';
import type { Habits } from '@/lib/clinical/clinical-types';

function Harness() {
  const [v, setV] = useState<Habits>({});
  return <><HabitsEditor value={v} onChange={setV} />
    <output data-testid="tabaquismo">{`${v.tabaquismo?.activo ?? false}|${v.tabaquismo?.porDia ?? ''}`}</output></>;
}

it('marca fuma y registra cigarrillos por día', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  expect(screen.getByTestId('tabaquismo')).toHaveTextContent('false|');
  await user.click(within(screen.getByRole('radiogroup', { name: 'Fuma' })).getByRole('radio', { name: 'Sí' }));
  await user.type(screen.getByLabelText(/cigarrillos por día/i), '10');
  expect(screen.getByTestId('tabaquismo')).toHaveTextContent('true|10');
});

function JsonHarness({ initial = {} }: { initial?: Habits }) {
  const [v, setV] = useState<Habits>(initial);
  return <><HabitsEditor value={v} onChange={setV} /><output data-testid="json">{JSON.stringify(v)}</output></>;
}

it('cada hábito empieza «Sin responder» y nada se emite como «No»', () => {
  render(<JsonHarness />);
  const groups = screen.getAllByRole('radiogroup');
  expect(groups).toHaveLength(7);
  for (const g of groups) {
    expect(within(g).getByRole('radio', { name: 'Sin responder' })).toBeChecked();
    expect(within(g).getByRole('radio', { name: 'No' })).not.toBeChecked();
  }
  expect(screen.getByTestId('json')).toHaveTextContent('{}');
});

it('«No» solo se guarda si se elige, y «Sin responder» lo quita', async () => {
  const user = userEvent.setup();
  render(<JsonHarness />);
  const bruxismo = screen.getByRole('radiogroup', { name: 'Bruxismo' });
  await user.click(within(bruxismo).getByRole('radio', { name: 'No' }));
  expect(JSON.parse(screen.getByTestId('json').textContent ?? '')).toEqual({ bruxismo: false });
  const hilo = screen.getByRole('radiogroup', { name: 'Usa hilo dental' });
  await user.click(within(hilo).getByRole('radio', { name: 'Sí' }));
  expect(JSON.parse(screen.getByTestId('json').textContent ?? '')).toEqual({ bruxismo: false, higieneOral: { hilo: true } });
  await user.click(within(bruxismo).getByRole('radio', { name: 'Sin responder' }));
  await user.click(within(hilo).getByRole('radio', { name: 'Sin responder' }));
  expect(screen.getByTestId('json')).toHaveTextContent('{}');
});

it('una versión previa con «false» se muestra «No»; lo ausente, «Sin responder»', () => {
  render(<JsonHarness initial={{ tabaquismo: { activo: false } }} />);
  expect(within(screen.getByRole('radiogroup', { name: 'Fuma' })).getByRole('radio', { name: 'No' })).toBeChecked();
  expect(
    within(screen.getByRole('radiogroup', { name: 'Consume alcohol' })).getByRole('radio', { name: 'Sin responder' }),
  ).toBeChecked();
});
