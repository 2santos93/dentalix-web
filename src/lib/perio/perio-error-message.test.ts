import { ApiError } from '@/lib/api/client';
import { perioErrorMessage } from './perio-api';

describe('perioErrorMessage (QA DX-007: nada de errores crudos en inglés)', () => {
  it('usa el texto del servidor en 400 y 409, que el módulo redacta en español', () => {
    expect(perioErrorMessage(new ApiError(400, 'Sondaje fuera de rango'), 'x')).toBe(
      'Sondaje fuera de rango',
    );
    expect(perioErrorMessage(new ApiError(409, 'El examen ya está finalizado'), 'x')).toBe(
      'El examen ya está finalizado',
    );
  });

  it.each([403, 404, 500, 503])('cae en el texto propio con %i', (status) => {
    expect(
      perioErrorMessage(new ApiError(status, 'Internal server error'), 'No se pudo cargar'),
    ).toBe('No se pudo cargar');
  });

  it('cae en el texto propio con un error de red', () => {
    expect(perioErrorMessage(new TypeError('Failed to fetch'), 'No se pudo cargar')).toBe(
      'No se pudo cargar',
    );
  });
});
