import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Wizard, WizardNav } from './wizard';

const steps = [
  { key: 'a', label: 'Paso A' },
  { key: 'b', label: 'Paso B' },
  { key: 'c', label: 'Paso C' },
];

it('marca el paso actual con aria-current="step"', () => {
  render(
    <Wizard steps={steps} current={1} onStepChange={() => {}}>
      <p>contenido</p>
    </Wizard>,
  );
  const current = screen.getByText('Paso B').closest('li');
  expect(current).toHaveAttribute('aria-current', 'step');
  expect(screen.getByText('Paso A').closest('li')).not.toHaveAttribute('aria-current');
  expect(screen.getByText('Paso C').closest('li')).not.toHaveAttribute('aria-current');
});

it('WizardNav llama onBack y onNext en un paso intermedio', async () => {
  const user = userEvent.setup();
  const onBack = jest.fn();
  const onNext = jest.fn();
  const onSubmit = jest.fn();
  render(<WizardNav current={1} total={3} onBack={onBack} onNext={onNext} onSubmit={onSubmit} submitting={false} />);
  await user.click(screen.getByRole('button', { name: /atrás/i }));
  expect(onBack).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('button', { name: /siguiente/i }));
  expect(onNext).toHaveBeenCalledTimes(1);
  expect(onSubmit).not.toHaveBeenCalled();
});

it('WizardNav oculta "Atrás" en el primer paso', () => {
  render(<WizardNav current={0} total={3} onBack={() => {}} onNext={() => {}} onSubmit={() => {}} submitting={false} />);
  expect(screen.queryByRole('button', { name: /atrás/i })).not.toBeInTheDocument();
});

it('WizardNav muestra el submitLabel en el último paso y llama onSubmit', async () => {
  const user = userEvent.setup();
  const onNext = jest.fn();
  const onSubmit = jest.fn();
  render(
    <WizardNav
      current={2}
      total={3}
      onBack={() => {}}
      onNext={onNext}
      onSubmit={onSubmit}
      submitting={false}
      submitLabel="Guardar"
    />,
  );
  expect(screen.queryByRole('button', { name: /siguiente/i })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /guardar/i }));
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(onNext).not.toHaveBeenCalled();
});
