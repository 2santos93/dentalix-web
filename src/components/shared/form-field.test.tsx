import { render, screen } from '@testing-library/react';
import { FormField, fieldErrorId, fieldHintId } from './form-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';

// DX-118 (FE-032): la ayuda y el error de un FormField describen a su control
// sin que quien lo usa tenga que cablear aria-describedby.
describe('FormField (DX-118)', () => {
  it('la ayuda lleva id y el control la tiene en aria-describedby', () => {
    render(
      <FormField htmlFor="motivo" label="Motivo" hint="Mínimo 10 caracteres.">
        <Input id="motivo" />
      </FormField>,
    );
    const input = screen.getByLabelText('Motivo');
    expect(input).toHaveAttribute('aria-describedby', fieldHintId('motivo'));
    expect(input).toHaveAccessibleDescription('Mínimo 10 caracteres.');
  });

  it('con error, el control apunta al error (la ayuda no se pinta) y conserva lo que ya describía', () => {
    render(
      <FormField htmlFor="motivo" label="Motivo" hint="Mínimo 10 caracteres." error="Escribe el motivo.">
        <Input id="motivo" aria-describedby="otro" aria-invalid />
      </FormField>,
    );
    const input = screen.getByLabelText('Motivo');
    expect(input).toHaveAttribute('aria-describedby', `otro ${fieldErrorId('motivo')}`);
    expect(input).toHaveAccessibleDescription('Escribe el motivo.');
  });

  it('no duplica el id cuando el llamador ya lo puso, y respeta un hintId propio', () => {
    render(
      <FormField htmlFor="d" label="Documento" hint="Sin puntos." hintId="d-ayuda" error="Falta.">
        <Input id="d" aria-describedby={fieldErrorId('d')} />
      </FormField>,
    );
    expect(screen.getByLabelText('Documento')).toHaveAttribute('aria-describedby', fieldErrorId('d'));
  });

  it('un control que no es el del campo (otro id) no se toca', () => {
    render(
      <FormField htmlFor="sede" label="Sede" hint="Elige una.">
        <NativeSelect id="sede">
          <option>Principal</option>
        </NativeSelect>
        <p id="aparte">Texto aparte</p>
      </FormField>,
    );
    expect(screen.getByLabelText('Sede')).toHaveAttribute('aria-describedby', fieldHintId('sede'));
    expect(screen.getByText('Texto aparte')).not.toHaveAttribute('aria-describedby');
  });
});
