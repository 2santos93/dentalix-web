import type { PublicAnamnesis } from '../../src/lib/anamnesis/anamnesis-api';

/** Synthetic contract fixture; never copied from a patient or clinic. */
export function publicAnamnesisFixture(primaryColor = '#0E7490'): PublicAnamnesis {
  return {
    clinic: { name: 'Clínica de prueba', logoUrl: null, primaryColor },
    patientFirstName: 'Ejemplo',
    expiresAt: '2030-10-30T15:00:00.000Z',
    consent: { required: true, policy: { id: 'synthetic-policy', version: 1,
      sensitiveHealthText: 'Autorización sintética para tratar datos de salud.',
      policyText: 'Política sintética de tratamiento de datos.' } },
    questionnaire: {
      version: 'synthetic-v1', answers: ['SI', 'NO', 'NO_SE'],
      answerLabels: { SI: 'Sí', NO: 'No', NO_SE: 'No sé' },
      allergyTypes: [{ value: 'MEDICAMENTO', label: 'Medicamento' }],
      allergySeverities: [{ value: 'MODERADA', label: 'Moderada o no lo sé' }],
      limits: { text: 200, note: 500, listItems: 20, weeks: 45, perDay: 200 },
      declaration: 'Declaro que la información que he dado es verdadera.',
      sections: [{ key: 'allergies', title: 'Su salud', questions: [
        { key: 'allergies', label: '¿Tiene alguna alergia?', followUp: {
          kind: 'ALLERGY_LIST', label: 'Escriba cada alergia', required: true,
        } },
        { key: 'condition:DIABETES', label: '¿Tiene diabetes?' },
      ] }],
    },
  };
}
