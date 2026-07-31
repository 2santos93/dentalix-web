import { render, screen } from '@testing-library/react';
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
  await user.click(screen.getByLabelText(/fuma/i));
  await user.type(screen.getByLabelText(/cigarrillos por día/i), '10');
  expect(screen.getByTestId('tabaquismo')).toHaveTextContent('true|10');
});
