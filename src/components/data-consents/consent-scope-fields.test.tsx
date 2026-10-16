import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ConsentScopeFields } from './consent-scope-fields';
import { EMPTY_SELECTION, type ConsentSelection } from '@/lib/data-consents/data-consents-api';
import { policyFixture } from '@/lib/test/data-consents';

function Harness({ onChange }: { onChange: (v: ConsentSelection) => void }) {
  const [value, setValue] = useState(EMPTY_SELECTION);
  return (
    <ConsentScopeFields
      idPrefix="t"
      policy={policyFixture()}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

it('muestra el texto de la política y una casilla por scope, ninguna premarcada', () => {
  render(<Harness onChange={jest.fn()} />);
  expect(
    screen.getByRole('region', { name: /texto completo de la política/i }),
  ).toHaveTextContent('Política de tratamiento de datos de la Clínica Demo.');
  const boxes = screen.getAllByRole('checkbox');
  expect(boxes).toHaveLength(3);
  for (const box of boxes) expect(box).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: /datos sensibles de salud/i })).toBeInTheDocument();
  expect(screen.getByText(/no está obligado a autorizarlos/i)).toBeInTheDocument();
  expect(screen.getByText(/versión 1 · publicada el 01\/10\/2026/i)).toBeInTheDocument();
});

it('cada casilla cambia solo su scope', async () => {
  const user = userEvent.setup();
  const onChange = jest.fn();
  render(<Harness onChange={onChange} />);
  await user.click(screen.getByRole('checkbox', { name: /comunicaciones comerciales/i }));
  expect(onChange).toHaveBeenLastCalledWith({
    GENERAL: false,
    SENSITIVE_HEALTH: false,
    MARKETING: true,
  });
});
