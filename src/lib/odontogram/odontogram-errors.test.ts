import { ApiError } from '@/lib/api/api-error';
import { asOfErrorMessage, dentitionMismatchMessage } from './odontogram-errors';

describe('errores del odontograma por código (DX-132)', () => {
  it('fecha futura y fecha inexistente: el texto del servidor', () => {
    expect(
      asOfErrorMessage(
        new ApiError(400, 'La fecha de la carta no puede ser futura', { code: 'ODONTOGRAM_AS_OF_FUTURE' }),
      ),
    ).toBe('La fecha de la carta no puede ser futura');
    expect(asOfErrorMessage(new ApiError(400, '', { code: 'ODONTOGRAM_AS_OF_INVALID' }))).toMatch(
      /formato AAAA-MM-DD/,
    );
  });

  it('decide por el código, no por el texto', () => {
    expect(asOfErrorMessage(new ApiError(400, 'La fecha de la carta no puede ser futura'))).toBeNull();
    expect(asOfErrorMessage(new ApiError(500, 'x', { code: 'ODONTOGRAM_AS_OF_FUTURE' }))).toBeNull();
    expect(asOfErrorMessage(new Error('red'))).toBeNull();
  });

  it('dentición: el 422 con código; sin texto, el respaldo en español', () => {
    const message = 'El diente 55 es temporal, pero la posición 15 está en dentición permanente.';
    expect(dentitionMismatchMessage(new ApiError(422, message, { code: 'TOOTH_DENTITION_MISMATCH' }))).toBe(message);
    expect(dentitionMismatchMessage(new ApiError(422, '', { code: 'TOOTH_DENTITION_MISMATCH' }))).toMatch(
      /no cabe en la dentición/,
    );
    expect(dentitionMismatchMessage(new ApiError(422, message))).toBeNull();
  });
});
