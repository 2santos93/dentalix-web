import {
  draftFromTemplateItem,
  emptyItemDraft,
  itemDraftErrors,
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

describe('itemDraftErrors', () => {
  const complete = {
    ...emptyItemDraft(),
    activeIngredient: 'Amoxicilina',
    concentration: '500 mg',
    pharmaceuticalForm: 'Cápsula',
    route: 'Oral',
    dose: '1 cápsula',
    frequency: 'Cada 8 horas',
    durationDays: '7',
    totalQuantity: '21',
    quantityUnit: 'cápsulas',
  };

  it('un medicamento completo no tiene errores (envases y marca opcionales)', () => {
    expect(itemDraftErrors(complete)).toEqual({});
  });

  it('marca cada campo obligatorio vacío con un mensaje en español', () => {
    const errors = itemDraftErrors(emptyItemDraft());
    expect(Object.keys(errors)).toEqual([
      'activeIngredient',
      'concentration',
      'pharmaceuticalForm',
      'route',
      'dose',
      'frequency',
      'durationDays',
      'totalQuantity',
      'quantityUnit',
    ]);
    expect(errors.concentration).toBe('Falta la concentración.');
    expect(errors.durationDays).toMatch(/^Falta la duración/);
  });

  it('itemDraftErrors never requires packages', () => {
    expect(itemDraftErrors({ ...complete, packages: '' })).toEqual({});
    expect(itemDraftErrors({ ...complete, packages: '   ' })).toEqual({});
    expect(itemDraftErrors({ ...complete, packages: '1' })).toEqual({});
    expect(itemDraftErrors(emptyItemDraft())).not.toHaveProperty('packages');
  });

  it('los números deben ser enteros dentro de su rango, también con coma decimal', () => {
    const errors = itemDraftErrors(
      { ...complete, durationDays: '7,5', totalQuantity: '0', packages: '100' },
    );
    expect(errors.durationDays).toBe('Debe ser un número entero entre 1 y 365.');
    expect(errors.totalQuantity).toBe('Debe ser un número entero entre 1 y 9999.');
    expect(errors.packages).toBe('Debe ser un número entero entre 1 y 99.');
  });

  it('un texto solo con espacios cuenta como vacío', () => {
    expect(itemDraftErrors({ ...complete, dose: '   ' })).toEqual({ dose: 'Falta la dosis.' });
  });
});
