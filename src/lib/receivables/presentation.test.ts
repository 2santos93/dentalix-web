import {
  AGE_FILTERS,
  BUCKET_LABELS,
  BUCKET_ORDER,
  bucketOfAge,
  collectionMessage,
  collectionWhatsAppHref,
  csvFileName,
  telHref,
} from './presentation';

describe('cartera · presentación (DX-145)', () => {
  it('nombra los tramos en orden de antigüedad', () => {
    expect(BUCKET_ORDER.map((b) => BUCKET_LABELS[b])).toEqual([
      'Por vencer',
      '0–30 días',
      '31–60 días',
      '61–90 días',
      'Más de 90 días',
    ]);
  });

  it.each([
    [null, 'current'],
    [0, 'days0to30'],
    [30, 'days0to30'],
    [31, 'days31to60'],
    [60, 'days31to60'],
    [61, 'days61to90'],
    [90, 'days61to90'],
    [91, 'over90'],
  ] as const)('una antigüedad de %s días es del tramo %s', (age, bucket) => {
    expect(bucketOfAge(age)).toBe(bucket);
  });

  it('el filtro «Más de 90 días» pide minAgeDays=91', () => {
    expect(AGE_FILTERS.find((f) => f.label === 'Más de 90 días')?.minAgeDays).toBe(91);
    expect(AGE_FILTERS[0]).toEqual({ value: 'all', label: 'Cualquier antigüedad' });
  });

  it('el mensaje de WhatsApp lleva SOLO el nombre y la clínica: ni importes ni tratamientos', () => {
    const text = collectionMessage({ patientName: 'Ana María Pérez', clinicName: 'Clínica Sonrisas' });
    expect(text).toBe(
      'Hola Ana, te escribimos de Clínica Sonrisas. ¿Tienes un momento para hablar con nosotros? Puedes respondernos por aquí.',
    );
    expect(text).not.toMatch(/\d/);
    expect(text).not.toMatch(/\$|COP|saldo|deuda|cuota|tratamiento/i);
  });

  it('sin nombre de clínica dice «la clínica» y añade su teléfono de contacto si lo hay', () => {
    expect(
      collectionMessage({ patientName: '', clinicName: null, contactPhone: '+57 601 555 0000' }),
    ).toBe(
      'Hola, te escribimos de la clínica. ¿Tienes un momento para hablar con nosotros? Puedes respondernos por aquí o llamarnos al +57 601 555 0000.',
    );
  });

  it('arma el enlace wa.me solo si el teléfono sirve', () => {
    expect(
      collectionWhatsAppHref({ fullName: 'Ana Pérez', whatsApp: '573001234567' }, 'Clínica X'),
    ).toBe(
      `https://wa.me/573001234567?text=${encodeURIComponent(
        'Hola Ana, te escribimos de Clínica X. ¿Tienes un momento para hablar con nosotros? Puedes respondernos por aquí.',
      )}`,
    );
    expect(collectionWhatsAppHref({ fullName: 'Ana', whatsApp: null }, 'X')).toBeNull();
  });

  it('tel: sin espacios ni guiones', () => {
    expect(telHref('+57 300-123 4567')).toBe('tel:+573001234567');
  });

  it('nombra el CSV con la fecha de la sede', () => {
    expect(csvFileName('2026-10-17')).toBe('cartera-2026-10-17.csv');
  });
});
