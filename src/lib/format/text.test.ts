import { collapseSpaces } from './text';

describe('collapseSpaces', () => {
  it('recorta y junta los espacios repetidos, saltos incluidos', () => {
    expect(collapseSpaces('  Lab   Dental\n SAS ')).toBe('Lab Dental SAS');
    expect(collapseSpaces('   ')).toBe('');
  });
});
