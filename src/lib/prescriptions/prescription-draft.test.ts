import {
  draftFromTemplateItem,
  emptyItemDraft,
  itemInputFromDraft,
  templateItemInputFromDraft,
} from './prescription-draft';

describe('prescription-draft', () => {
  it('un borrador vacío no manda nada; los números se convierten y los textos se recortan', () => {
    expect(itemInputFromDraft(emptyItemDraft())).toEqual({});
    expect(
      itemInputFromDraft({
        ...emptyItemDraft(),
        activeIngredient: ' Amoxicilina ',
        durationDays: '7',
        totalQuantity: ' 21 ',
        packages: '',
        instructions: '  ',
      }),
    ).toEqual({ activeIngredient: 'Amoxicilina', durationDays: 7, totalQuantity: 21 });
  });

  it('acepta la coma decimal y manda el número tal cual: la API rechaza los no enteros', () => {
    expect(itemInputFromDraft({ ...emptyItemDraft(), durationDays: '7,5' }).durationDays).toBe(7.5);
  });

  it('parte de un medicamento de plantilla (null → vacío)', () => {
    const draft = draftFromTemplateItem({
      activeIngredient: 'Ibuprofeno',
      brandName: null,
      concentration: '600 mg',
      pharmaceuticalForm: null,
      route: 'Oral',
      dose: null,
      frequency: null,
      durationDays: 3,
      totalQuantity: 9,
      quantityUnit: 'tabletas',
      packages: null,
      instructions: null,
    });
    expect(draft).toMatchObject({
      activeIngredient: 'Ibuprofeno',
      concentration: '600 mg',
      pharmaceuticalForm: '',
      durationDays: '3',
      totalQuantity: '9',
      packages: '',
    });
  });

  it('para plantillas el principio activo siempre viaja (la API dice si falta)', () => {
    expect(templateItemInputFromDraft(emptyItemDraft())).toEqual({ activeIngredient: '' });
  });
});
