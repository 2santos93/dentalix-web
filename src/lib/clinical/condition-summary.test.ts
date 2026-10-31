import { STANDARD_CONDITIONS, summarizeConditions } from './clinical-types';

it('la ausencia cuenta como «sin responder», nunca como «No»', () => {
  expect(summarizeConditions([])).toEqual({ si: 0, no: 0, desconoce: 0, sinResponder: STANDARD_CONDITIONS.length });
  expect(summarizeConditions(null).sinResponder).toBe(STANDARD_CONDITIONS.length);
});

it('cuenta Sí / No / No sabe explícitos y las condiciones fuera del checklist', () => {
  expect(
    summarizeConditions([
      { codigo: 'DIABETES', etiqueta: 'Diabetes', estado: 'SI', esAlerta: true },
      { codigo: 'ASMA', etiqueta: 'Asma', estado: 'NO', esAlerta: false },
      { codigo: 'RENAL', etiqueta: 'Renal', estado: 'DESCONOCE', esAlerta: false },
      { codigo: 'OTRA', etiqueta: 'Migraña', estado: 'SI', esAlerta: false },
    ]),
  ).toEqual({ si: 2, no: 1, desconoce: 1, sinResponder: STANDARD_CONDITIONS.length - 3 });
});
