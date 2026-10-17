import {
  SKIPPED_ANSWER,
  answerText,
  composeNote,
  initialAnswer,
  type ComposablePrompt,
} from './compose';

const surface: ComposablePrompt = {
  id: 's',
  label: 'Superficie',
  type: 'ONE',
  options: ['O', 'M', 'D', 'V', 'L'],
  defaultValue: null,
};
const material: ComposablePrompt = {
  id: 'm',
  label: 'Material',
  type: 'MULTI',
  options: ['Resina A2', 'Ionómero', 'Adhesivo'],
  defaultValue: 'Resina A2',
};
const remarks: ComposablePrompt = {
  id: 'o',
  label: 'Observaciones',
  type: 'TEXT',
  options: [],
  defaultValue: null,
};
const prompts = [surface, material, remarks];
const BODY = 'Resina en {{Superficie}} con {{ material }}. {{Observaciones}}';

describe('composición del texto de la evolución (DX-170)', () => {
  it('rellena cada marcador con su respuesta; MULTI en el orden de las opciones', () => {
    expect(
      composeNote(BODY, prompts, {
        s: { values: ['O'], skipped: false },
        m: { values: ['Adhesivo', 'Resina A2'], skipped: false },
        o: { values: [' Sin dolor '], skipped: false },
      }),
    ).toBe('Resina en O con Resina A2 y Adhesivo. Sin dolor');
  });

  it('valores por defecto: la respuesta inicial es el defecto de la pregunta', () => {
    expect(initialAnswer(material)).toEqual({ values: ['Resina A2'], skipped: false });
    expect(initialAnswer(surface)).toEqual({ values: [], skipped: false });
    expect(answerText(material, undefined)).toBe('Resina A2');
  });

  it('omitidas o vacías quedan marcadas «[sin respuesta]»', () => {
    expect(SKIPPED_ANSWER).toBe('[sin respuesta]');
    expect(
      composeNote(BODY, prompts, {
        s: { values: ['O'], skipped: true },
        m: { values: [], skipped: false },
        o: { values: ['   '], skipped: false },
      }),
    ).toBe('Resina en [sin respuesta] con [sin respuesta]. [sin respuesta]');
  });

  it('escapa: una respuesta con marcadores o patrones de reemplazo se copia literal', () => {
    expect(
      composeNote('{{Observaciones}} / {{Superficie}}', prompts, {
        o: { values: ['{{Superficie}} $& <b>x</b>'], skipped: false },
        s: { values: ['M'], skipped: false },
      }),
    ).toBe('{{Superficie}} $& <b>x</b> / M');
  });

  it('un marcador sin pregunta queda «[sin respuesta]»', () => {
    expect(composeNote('Diente {{Diente}}', prompts, {})).toBe('Diente [sin respuesta]');
  });
});
