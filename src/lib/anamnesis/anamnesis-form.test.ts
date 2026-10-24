import {
  emptyAllergy,
  formCopy,
  initialFormState,
  toSubmitBody,
  validateForm,
  type AnamnesisFormState,
  type QuestionnaireShape,
} from './anamnesis-form';

const Q: QuestionnaireShape = {
  limits: { text: 200, note: 500, listItems: 20, weeks: 45, perDay: 200 },
  sections: [
    { key: 'allergies', questions: [{ key: 'allergies' }] },
    { key: 'conditions', questions: [{ key: 'condition:DIABETES' }, { key: 'condition:ASMA' }] },
    { key: 'medications', questions: [{ key: 'anticoagulants' }, { key: 'medications' }] },
    {
      key: 'habits',
      questions: [{ key: 'habits.tabaquismo' }, { key: 'habits.alcohol' }, { key: 'habits.bruxismo' }],
    },
    { key: 'pregnancy', questions: [{ key: 'pregnancy' }] },
    { key: 'surgeries', questions: [{ key: 'surgeries' }] },
  ],
};

function allNo(): AnamnesisFormState {
  const state = initialFormState();
  for (const s of Q.sections) for (const q of s.questions) state.answers[q.key] = 'NO';
  state.declaration = true;
  return state;
}

describe('formulario público de anamnesis (DX-099)', () => {
  it('nace en blanco: ninguna respuesta precargada', () => {
    const state = initialFormState();
    expect(state.answers).toEqual({});
    expect(state.declaration).toBe(false);
  });

  it('pide responder cada pregunta y la declaración, en español y en orden', () => {
    const errors = validateForm(initialFormState(), Q);
    expect(Object.keys(errors)[0]).toBe('allergies');
    expect(errors['condition:ASMA']).toBe(formCopy.unanswered);
    expect(errors.declaration).toBe(formCopy.declaration);
  });

  it('todo «No» con la declaración es válido', () => {
    expect(validateForm(allNo(), Q)).toEqual({});
  });

  it('«Sí» a alergias exige nombre y tipo', () => {
    const state = allNo();
    state.answers.allergies = 'SI';
    expect(validateForm(state, Q)).toMatchObject({ allergies: formCopy.allergyMissing });
    state.allergies = [{ ...emptyAllergy(), alergeno: 'Penicilina' }];
    expect(validateForm(state, Q)).toEqual({ 'allergies.0.tipo': formCopy.allergyType });
  });

  it('semanas y cigarrillos fuera de rango', () => {
    const state = allNo();
    state.answers.pregnancy = 'SI';
    state.pregnancyWeeks = '60';
    state.answers['habits.tabaquismo'] = 'SI';
    state.smokingPerDay = 'diez';
    expect(validateForm(state, Q)).toEqual({
      'pregnancy.weeks': formCopy.weeks(45),
      'habits.tabaquismo.perDay': formCopy.perDay(200),
    });
  });

  it('arma el cuerpo: seguimientos solo de los «Sí», consentimiento si se pidió', () => {
    const state = allNo();
    state.answers.allergies = 'SI';
    state.allergies = [
      { alergeno: ' Penicilina ', tipo: 'MEDICAMENTO', severidad: 'ANAFILAXIA', reaccion: '' },
      emptyAllergy(),
    ];
    state.answers.anticoagulants = 'SI';
    state.anticoagulantDetail = 'Warfarina';
    state.answers['condition:DIABETES'] = 'SI';
    state.notes['condition:DIABETES'] = 'Tipo 2';
    state.notes['condition:ASMA'] = 'escrito antes de cambiar a No';
    state.answers['habits.tabaquismo'] = 'SI';
    state.smokingPerDay = '5';
    const body = toSubmitBody(state, Q, 'policy-1');
    expect(body.answers.allergies).toEqual({
      answer: 'SI',
      items: [{ alergeno: 'Penicilina', tipo: 'MEDICAMENTO', severidad: 'ANAFILAXIA' }],
    });
    expect(body.answers.conditions).toEqual([
      { codigo: 'DIABETES', answer: 'SI', nota: 'Tipo 2' },
      { codigo: 'ASMA', answer: 'NO' },
    ]);
    expect(body.answers.anticoagulants).toEqual({ answer: 'SI', detail: 'Warfarina' });
    expect(body.answers.habits.tabaquismo).toEqual({ answer: 'SI', porDia: 5 });
    expect(body.answers.medications).toEqual({ answer: 'NO' });
    expect(body.declarationAccepted).toBe(true);
    expect(body.consent).toEqual({ policyVersionId: 'policy-1', granted: true });
    expect(toSubmitBody(state, Q, null).consent).toBeUndefined();
  });
});
