import { collapseSpaces, endSentence } from './text';

describe('collapseSpaces', () => {
  it('recorta y junta los espacios repetidos, saltos incluidos', () => {
    expect(collapseSpaces('  Lab   Dental\n SAS ')).toBe('Lab Dental SAS');
    expect(collapseSpaces('   ')).toBe('');
  });
});

describe('endSentence', () => {
  it('adds the final period only when missing (a 12 h time already ends in one)', () => {
    expect(endSentence('terminaría a las 10:30')).toBe('terminaría a las 10:30.');
    expect(endSentence('terminaría a las 10:30 a. m.')).toBe('terminaría a las 10:30 a. m.');
  });
});
