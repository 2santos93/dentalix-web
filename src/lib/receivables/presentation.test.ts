import {
  overdueAmounts,
  reminderDaysText,
  reminderMessage,
  reminderWhatsAppHref,
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
    expect(text).not.toMatch(/\$|USD|saldo|deuda|cuota|tratamiento/i);
  });

  it('sin nombre de clínica dice «la clínica» y añade su teléfono de contacto si lo hay', () => {
    expect(
      collectionMessage({ patientName: '', clinicName: null, contactPhone: '+58 212 555 0000' }),
    ).toBe(
      'Hola, te escribimos de la clínica. ¿Tienes un momento para hablar con nosotros? Puedes respondernos por aquí o llamarnos al +58 212 555 0000.',
    );
  });

  it('arma el enlace wa.me solo si el teléfono sirve', () => {
    expect(
      collectionWhatsAppHref({ fullName: 'Ana Pérez', whatsApp: '584121234567' }, 'Clínica X'),
    ).toBe(
      `https://wa.me/584121234567?text=${encodeURIComponent(
        'Hola Ana, te escribimos de Clínica X. ¿Tienes un momento para hablar con nosotros? Puedes respondernos por aquí.',
      )}`,
    );
    expect(collectionWhatsAppHref({ fullName: 'Ana', whatsApp: null }, 'X')).toBeNull();
  });

  it('tel: sin espacios ni guiones', () => {
    expect(telHref('+58 412-123 4567')).toBe('tel:+584121234567');
  });

  it('nombra el CSV con la fecha de la sede', () => {
    expect(csvFileName('2026-10-17')).toBe('cartera-2026-10-17.csv');
  });
});

describe('aviso de saldo vencido (DX-146)', () => {
  const currency = (code: string, buckets: Partial<Record<string, number>>) => ({
    currency: code,
    balance: 0,
    debt: 0,
    credit: 0,
    buckets: { current: 0, days0to30: 0, days31to60: 0, days61to90: 0, over90: 0, ...buckets },
    oldestAgeDays: null,
    ageApproximate: false,
    nextInstallment: null,
    paymentsWithoutRateCount: 0,
    rateProviderTimedOut: false,
  });

  it('overdueAmounts suma lo vencido en céntimos, sin «por vencer», y omite monedas sin vencido', () => {
    expect(
      overdueAmounts([
        currency('USD', { current: 50, days0to30: 0.1, days31to60: 0.2, over90: 10 }),
        currency('VES', { current: 500 }),
      ]),
    ).toEqual([{ currency: 'USD', amount: 10.3 }]);
  });

  it('el mensaje lleva solo la clínica y el saldo con su moneda', () => {
    expect(reminderMessage({ clinicName: 'Clínica Sonrisa', amounts: ['USD 120,00', 'VES 1.000,00'] })).toBe(
      'Hola, te escribimos de Clínica Sonrisa. Tienes un saldo vencido de USD 120,00 y VES 1.000,00. Si ya lo pagaste, ignora este mensaje. Puedes respondernos por aquí para ponerte al día.',
    );
    expect(reminderMessage({ clinicName: null, amounts: [] })).toContain('te escribimos de la clínica. Tienes un saldo vencido.');
  });

  it('sin WhatsApp no hay enlace; con él, wa.me con el texto', () => {
    expect(reminderWhatsAppHref(null, 'X', ['USD 1,00'])).toBeNull();
    expect(reminderWhatsAppHref('584125550101', 'X', ['USD 1,00'])).toMatch(/^https:\/\/wa\.me\/584125550101\?text=Hola/);
  });

  it('reminderDaysText', () => {
    expect(reminderDaysText([7, 30, 60])).toBe('7, 30 y 60 días');
    expect(reminderDaysText([40])).toBe('40 días');
  });
});
