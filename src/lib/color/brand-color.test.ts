import { accentFamily, ratio } from './accent';
import { brandColorReport, STATUS_HUES } from './brand-color';

describe('brandColorReport (DX-019)', () => {
  it('el teal por defecto: sin ajuste y lejos de los estados', () => {
    const report = brandColorReport('#0E7490')!;
    expect(report.adjusted).toBe(false);
    expect(report.lowContrast).toBe(false);
    expect(report.statusHue).toBeNull();
    expect(report.whiteRatio).toBeGreaterThanOrEqual(4.5);
  });

  it('un color sin contraste AA se advierte y la familia derivada sí lo cumple, en claro y en oscuro', () => {
    const report = brandColorReport('#7DD3FC')!;
    // Celeste claro: con texto blanco no llega; se conserva escribiendo en oscuro.
    expect(report.lowContrast).toBe(true);
    expect(report.whiteRatio).toBeLessThan(4.5);
    expect(report.inkText).toBe(true);
    // Un medio sin contraste con blanco ni con tinta: tono ajustado.
    const mid = brandColorReport('#3B82F6')!;
    expect(mid.lowContrast).toBe(true);
    expect(mid.adjusted).toBe(true);
    expect(mid.family.light.primary).not.toBe('#3B82F6');
    const fam = accentFamily('#7DD3FC')!;
    expect(ratio(fam.light.primary, fam.light.primaryFg)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(fam.dark.primary, fam.dark.primaryFg)).toBeGreaterThanOrEqual(4.5);
  });

  it('cerca de un estado fijo: rojo → peligro, verde → correcto, ámbar → aviso', () => {
    expect(brandColorReport('#B91C1C')!.statusHue).toBe('danger');
    expect(brandColorReport('#15803D')!.statusHue).toBe('success');
    expect(brandColorReport('#D97706')!.statusHue).toBe('warning');
    expect(brandColorReport(STATUS_HUES.danger.hex)!.statusHue).toBe('danger');
  });

  it('azul, violeta o un gris: sin aviso de estado', () => {
    expect(brandColorReport('#1D4ED8')!.statusHue).toBeNull();
    expect(brandColorReport('#6D28D9')!.statusHue).toBeNull();
    expect(brandColorReport('#4B5563')!.statusHue).toBeNull();
  });

  it('no es #RRGGBB: null', () => {
    expect(brandColorReport('#fff')).toBeNull();
    expect(brandColorReport('red')).toBeNull();
  });
});
