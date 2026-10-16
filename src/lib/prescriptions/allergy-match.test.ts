import { findAllergyMatches } from './allergy-match';

// Mismo comportamiento que la API (allergy-match.ts del módulo prescriptions):
// la web avisa en vivo y la API lo vuelve a comprobar (409).
describe('findAllergyMatches (web)', () => {
  it('coincide sin mayúsculas ni tildes y por familia', () => {
    expect(findAllergyMatches(['IBUPROFENO'], ['Ibuprofeno'])).toHaveLength(1);
    expect(findAllergyMatches(['Lidocaina'], ['lidocaína'])).toHaveLength(1);
    expect(findAllergyMatches(['Amoxicilina'], ['Penicilina'])).toEqual([
      { activeIngredient: 'Amoxicilina', allergen: 'Penicilina' },
    ]);
  });

  it('no avisa de más', () => {
    expect(findAllergyMatches(['Clorhexidina'], ['Penicilina', 'Látex'])).toEqual([]);
    expect(findAllergyMatches([''], ['Penicilina'])).toEqual([]);
    expect(findAllergyMatches(['Amoxicilina'], ['de'])).toEqual([]);
  });
});
