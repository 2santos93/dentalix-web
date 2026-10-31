import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NativeSelect } from './native-select';
import { FormField, fieldErrorId } from '@/components/shared/form-field';

test('es un <select> real: se elige con selectOptions y avisa con onChange', async () => {
  const user = userEvent.setup();
  const onChange = jest.fn();
  render(
    <NativeSelect aria-label="Sexo" defaultValue="" onChange={onChange}>
      <option value="">Elegir</option>
      <option value="F">Femenino</option>
      <option value="M">Masculino</option>
    </NativeSelect>,
  );
  const select = screen.getByRole('combobox', { name: 'Sexo' });
  expect(select.tagName).toBe('SELECT');
  await user.selectOptions(select, 'F');
  expect(select).toHaveValue('F');
  expect(onChange).toHaveBeenCalledTimes(1);
});

test('reenvía la ref al <select> y pinta el chevron decorativo', () => {
  const ref = React.createRef<HTMLSelectElement>();
  const { container } = render(
    <NativeSelect ref={ref} aria-label="Sede" className="sm:max-w-xs">
      <option>Centro</option>
    </NativeSelect>,
  );
  expect(ref.current).toBeInstanceOf(HTMLSelectElement);
  expect(ref.current).toHaveClass('appearance-none', 'h-10');
  // `className` maqueta el envoltorio, no el control.
  expect(ref.current?.parentElement).toHaveClass('relative', 'sm:max-w-xs');
  expect(container.querySelector('svg')).toHaveAttribute('aria-hidden');
});

test('size="sm" mide 32px (44px en táctil) y no pasa el atributo size al DOM', () => {
  render(
    <NativeSelect aria-label="Estado" size="sm">
      <option>Todos</option>
    </NativeSelect>,
  );
  const select = screen.getByRole('combobox', { name: 'Estado' });
  expect(select).toHaveClass('h-8', 'pointer-coarse:h-11');
  expect(select).not.toHaveAttribute('size');
});

test('dentro de FormField: etiqueta, aria-invalid y el error descrito', () => {
  render(
    <FormField htmlFor="doc-type" label="Tipo de documento" error="Elige un tipo de documento.">
      <NativeSelect id="doc-type" aria-invalid aria-describedby={fieldErrorId('doc-type')}>
        <option value="">Elegir</option>
      </NativeSelect>
    </FormField>,
  );
  const select = screen.getByRole('combobox', { name: 'Tipo de documento' });
  expect(select).toBeInvalid();
  expect(select).toHaveAccessibleDescription('Elige un tipo de documento.');
});
