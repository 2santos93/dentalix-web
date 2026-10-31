import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Textarea } from './textarea';
import { FormField, fieldErrorId } from '@/components/shared/form-field';

test('campo de varias líneas sobre fieldClass: 80px mínimo y redimensionable en vertical', async () => {
  const user = userEvent.setup();
  render(<Textarea aria-label="Motivo" />);
  const textarea = screen.getByRole('textbox', { name: 'Motivo' });
  expect(textarea).toHaveClass('min-h-20', 'resize-y', 'border-border-input');
  await user.type(textarea, 'Dolor{Enter}agudo');
  expect(textarea).toHaveValue('Dolor\nagudo');
});

test('autoGrow ajusta la altura al contenido y no se redimensiona a mano', async () => {
  const user = userEvent.setup();
  const onInput = jest.fn();
  render(<Textarea aria-label="Notas" autoGrow onInput={onInput} />);
  const textarea = screen.getByRole('textbox', { name: 'Notas' });
  expect(textarea).toHaveClass('resize-none');
  Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 132 });
  await user.type(textarea, 'a');
  expect(textarea.style.height).toBe('132px');
  expect(onInput).toHaveBeenCalled();
});

test('autoGrow reajusta cuando cambia un valor controlado', () => {
  function Harness({ value }: { value: string }) {
    return <Textarea aria-label="Plantilla" autoGrow value={value} onChange={() => {}} />;
  }
  const { rerender } = render(<Harness value="" />);
  const textarea = screen.getByRole('textbox', { name: 'Plantilla' });
  Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 200 });
  rerender(<Harness value={'línea\n'.repeat(10)} />);
  expect(textarea.style.height).toBe('200px');
});

test('reenvía la ref y encaja en FormField con su error', () => {
  const ref = React.createRef<HTMLTextAreaElement>();
  render(
    <FormField htmlFor="reason" label="Motivo de anulación" error="Escribe el motivo.">
      <Textarea id="reason" ref={ref} aria-invalid aria-describedby={fieldErrorId('reason')} />
    </FormField>,
  );
  const textarea = screen.getByRole('textbox', { name: 'Motivo de anulación' });
  expect(ref.current).toBe(textarea);
  expect(textarea).toBeInvalid();
  expect(textarea).toHaveAccessibleDescription('Escribe el motivo.');
});
