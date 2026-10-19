import {
  diagnosesPayload,
  emptyDiagnosesDraft,
  type DiagnosesDraft,
} from './diagnoses-draft';

const k021 = { code: 'K02.1', labelEs: 'Caries de la dentina' };
const k051 = { code: 'K05.1', labelEs: 'Gingivitis crónica' };

function draft(over: Partial<DiagnosesDraft> = {}): DiagnosesDraft {
  return { ...emptyDiagnosesDraft(), ...over };
}

describe('diagnosesPayload (DX-212)', () => {
  it('sin principal ni relacionados: sin diagnósticos (la evolución se guarda igual)', () => {
    expect(diagnosesPayload(emptyDiagnosesDraft())).toEqual({ diagnoses: [] });
  });

  it('principal y relacionado con diente, en ese orden', () => {
    expect(
      diagnosesPayload(
        draft({
          principal: { code: k021, tooth: '' },
          related: [{ key: 1, code: k051, tooth: ' 36 ' }],
        }),
      ),
    ).toEqual({
      diagnoses: [
        { icd10Code: 'K02.1', kind: 'PRINCIPAL' },
        { icd10Code: 'K05.1', kind: 'RELACIONADO', toothFdi: '36' },
      ],
    });
  });

  it('las filas de relacionado vacías se ignoran', () => {
    expect(
      diagnosesPayload(
        draft({
          principal: { code: k021, tooth: '' },
          related: [{ key: 1, code: null, tooth: '' }],
        }),
      ),
    ).toEqual({ diagnoses: [{ icd10Code: 'K02.1', kind: 'PRINCIPAL' }] });
  });

  it('relacionado sin principal: error en español', () => {
    expect(
      diagnosesPayload(draft({ related: [{ key: 1, code: k051, tooth: '' }] })),
    ).toEqual({ error: 'Elige primero el diagnóstico principal.' });
  });

  it('diente que no es FDI: error con el diente', () => {
    expect(
      diagnosesPayload(draft({ principal: { code: k021, tooth: '19' } })),
    ).toEqual({ error: 'El diente «19» no es un número FDI válido.' });
  });

  it('diente sin diagnóstico: error', () => {
    expect(diagnosesPayload(draft({ principal: { code: null, tooth: '36' } }))).toEqual({
      error: 'Elige el diagnóstico del diente 36.',
    });
  });
});
