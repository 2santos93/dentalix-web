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

  it('casa miembros de la familia por sufijo, plurales y forma inglesa (igual que la API)', () => {
    expect(findAllergyMatches(['Bencilpenicilina'], ['Penicilina'])).toHaveLength(1);
    expect(findAllergyMatches(['Cefazolina'], ['Cefalosporinas'])).toHaveLength(1);
    expect(findAllergyMatches(['Aceclofenaco'], ['AINE'])).toHaveLength(1);
    expect(findAllergyMatches(['Metronidazol'], ['metronidazole'])).toHaveLength(1);
  });

  it('no confunde «sulfato» con las sulfas', () => {
    expect(findAllergyMatches(['Sulfato ferroso'], ['Sulfas'])).toEqual([]);
  });
});
