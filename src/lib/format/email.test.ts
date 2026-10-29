import { isEmailAddress } from './email';

describe('isEmailAddress (como @IsEmail de la API)', () => {
  it.each([
    'ana@x.co',
    'ana.maria@clinica.com',
    'ana+citas@sub.clinica.com.ve',
    'josé@clínica.ve',
    'a@xn--80ak6aa92e.com',
    'ANA@CLINICA.COM',
  ])('acepta %s', (value) => {
    expect(isEmailAddress(value)).toBe(true);
  });

  it.each([
    ['sin dominio de nivel superior', 'ana@x'],
    ['sin dominio', 'ana@'],
    ['sin parte local', '@x.co'],
    ['sin arroba', 'ana.x.co'],
    ['dominio de nivel superior de una letra', 'ana@x.c'],
    ['dominio de nivel superior numérico', 'ana@x.12'],
    ['punto al final del dominio', 'ana@x.co.'],
    ['etiqueta vacía', 'ana@x..co'],
    ['guion al borde de una etiqueta', 'ana@-x.co'],
    ['punto al inicio de la parte local', '.ana@x.co'],
    ['puntos seguidos en la parte local', 'ana..maria@x.co'],
    ['espacio', 'ana maria@x.co'],
    ['dos arrobas', 'ana@b@x.co'],
    ['parte local de más de 64 bytes', `${'a'.repeat(65)}@x.co`],
    ['etiqueta de más de 63 caracteres', `ana@${'a'.repeat(64)}.co`],
    ['ancho completo en el dominio', 'ana@ｘ.co'],
  ])('rechaza %s (%s)', (_why, value) => {
    expect(isEmailAddress(value)).toBe(false);
  });
});
