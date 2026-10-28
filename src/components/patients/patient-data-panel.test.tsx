import { render, screen } from '@testing-library/react';
import { PatientDataPanel } from './patient-data-panel';
import type { Patient } from '@/lib/patients/patients-api';

function patient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: 'p1',
    tenantId: 't1',
    firstName: 'Carlos',
    lastName: 'Mejía',
    docType: 'CC',
    docNumber: '1002',
    birthDate: '1992-03-12T00:00:00.000Z',
    sex: 'M',
    phone: null,
    email: null,
    address: null,
    notes: null,
    dataConsentAccepted: false,
    dataConsentAt: null,
    dataConsentPolicyVersion: null,
    maritalStatus: null,
    occupation: null,
    physicianName: null,
    physicianPhone: null,
    emergencyContactName: null,
    emergencyContactRelationship: null,
    emergencyContactPhone: null,
    guardianName: null,
    guardianDocNumber: null,
    createdById: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Simula un runtime al oeste de UTC (Bogotá, UTC-5) sin depender de `TZ`:
 * jest.config.ts fija `process.env.TZ = 'UTC'` en el proceso padre, y V8 ya
 * cachea la zona horaria local al arrancar — cambiar `process.env.TZ` desde
 * un test no tiene ningún efecto sobre `Date`. En cambio los getters
 * *locales* (`getFullYear`/`getMonth`/`getDate`) sí se pueden interceptar en
 * `Date.prototype`, así que se reimplementan como si la zona local fuera
 * Bogotá — igual que el runtime real haría.
 */
function mockLocalTimezoneAsBogota() {
  const OFFSET_MS = 5 * 60 * 60 * 1000; // UTC-5
  const shifted = (d: Date) => new Date(d.getTime() - OFFSET_MS);
  jest
    .spyOn(Date.prototype, 'getFullYear')
    .mockImplementation(function (this: Date) {
      return shifted(this).getUTCFullYear();
    });
  jest.spyOn(Date.prototype, 'getMonth').mockImplementation(function (this: Date) {
    return shifted(this).getUTCMonth();
  });
  jest.spyOn(Date.prototype, 'getDate').mockImplementation(function (this: Date) {
    return shifted(this).getUTCDate();
  });
}

describe('PatientDataPanel', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('muestra identificación con la edad calculada', () => {
    // Edad fija: el test no puede depender del día en que corre.
    jest.useFakeTimers().setSystemTime(new Date('2026-08-01T12:00:00.000Z'));
    render(<PatientDataPanel patient={patient()} />);

    expect(screen.getByText('CC')).toBeInTheDocument();
    expect(screen.getByText('1002')).toBeInTheDocument();
    expect(screen.getByText(/34 años/)).toBeInTheDocument();
  });

  it('formatea la fecha de nacimiento con día y mes en dos dígitos', () => {
    // `toLocaleDateString('es')` (la implementación anterior) no rellena con
    // cero: un 5 de enero se mostraba "5/1/1992" en vez de "05/01/1992".
    render(<PatientDataPanel patient={patient({ birthDate: '1992-01-05T00:00:00.000Z' })} />);
    expect(screen.getByText(/05\/01\/1992/)).toBeInTheDocument();
    expect(screen.queryByText(/(^|[^0])5\/1\/1992/)).not.toBeInTheDocument();
  });

  it('no resta un día a la edad justo antes del cumpleaños, al oeste de UTC', () => {
    mockLocalTimezoneAsBogota();
    // "Hoy" en Bogotá es 31 de julio (un día antes del cumpleaños); nacido el
    // 1 de agosto de 2000 todavía no cumple años, la edad correcta es 25. La
    // implementación anterior leía `birthDate` con getters locales y perdía
    // el desfase de un día, dando 26.
    jest.useFakeTimers().setSystemTime(new Date('2026-08-01T04:00:00.000Z'));
    render(<PatientDataPanel patient={patient({ birthDate: '2000-08-01T00:00:00.000Z' })} />);
    expect(screen.getByText(/25 años/)).toBeInTheDocument();
    expect(screen.queryByText(/26 años/)).not.toBeInTheDocument();
  });

  it('oculta por completo un bloque sin datos', () => {
    render(<PatientDataPanel patient={patient()} />);
    // Sin contacto de emergencia ni acudiente cargados.
    expect(screen.queryByText(/^Emergencia$/)).not.toBeInTheDocument();
  });

  it('muestra el bloque de emergencia cuando hay datos', () => {
    render(
      <PatientDataPanel
        patient={patient({ emergencyContactName: 'Ana Pérez', emergencyContactRelationship: 'Madre' })}
       
      />,
    );
    expect(screen.getByText(/^Emergencia$/)).toBeInTheDocument();
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
  });

  it('muestra el consentimiento con su fecha cuando fue aceptado', () => {
    // El consentimiento no cuenta para decidir si el bloque se muestra (es
    // `alwaysShown`), así que necesita otro dato administrativo presente.
    render(
      <PatientDataPanel
        patient={patient({
          occupation: 'Docente',
          dataConsentAccepted: true,
          dataConsentAt: '2026-03-12T00:00:00.000Z',
        })}
       
      />,
    );
    expect(screen.getByText(/consentimiento/i)).toBeInTheDocument();
  });

  it('muestra la versión de la política cuando el consentimiento la trae', () => {
    render(
      <PatientDataPanel
        patient={patient({
          occupation: 'Docente',
          dataConsentAccepted: true,
          dataConsentAt: '2026-03-12T00:00:00.000Z',
          dataConsentPolicyVersion: '2.1',
        })}
       
      />,
    );
    expect(screen.getByText(/v2\.1/)).toBeInTheDocument();
  });

  it('oculta el bloque administrativo aunque el consentimiento esté pendiente', () => {
    // El consentimiento siempre produce un valor ("Pendiente" o "Aceptado ·
    // fecha"), así que sin marcarlo `alwaysShown` el bloque nunca se ocultaría.
    render(<PatientDataPanel patient={patient()} />);
    expect(screen.queryByText(/^Administrativo$/)).not.toBeInTheDocument();
  });

  it('no lleva ninguna acción propia: «Editar» vive ahora en la cabecera', () => {
    // Era un botón secundario alineado a la derecha sobre el primer bloque,
    // dentro de una Card sin título. La acción es de la ficha entera, no de
    // esta pestaña, y su contrato está en `patient-record-header.test.tsx`.
    render(<PatientDataPanel patient={patient()} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('PatientDataPanel · sin aseguradora en texto libre (DX-322)', () => {
  const coverage = (status: 'NONE' | 'ACTIVE' | 'EXPIRED' | 'NOT_STARTED') => ({
    status,
    payerName: null,
    planName: null,
    validTo: null,
  });

  it('patient data panel never shows a legacy insurer row', () => {
    // DX-322: el texto libre de aseguradora sale del contrato; aunque una
    // respuesta antigua lo traiga, la ficha no lo pinta.
    const stale = { ...patient({ occupation: 'Docente', coverage: coverage('NONE') }), insurerEps: 'Sanitas' };
    render(<PatientDataPanel patient={stale} />);
    expect(screen.queryByText('Aseguradora (dato anterior)')).not.toBeInTheDocument();
    expect(screen.queryByText('Aseguradora / EPS')).not.toBeInTheDocument();
    expect(screen.queryByText('Sanitas')).not.toBeInTheDocument();
  });
});

describe('paciente importado (DX-107)', () => {
  it('marca el origen y la autorización de datos como pendiente, aunque no tenga datos administrativos', () => {
    render(<PatientDataPanel patient={patient({ importBatchId: 'batch-1' })} />);
    expect(screen.getByText('Origen de la ficha')).toBeInTheDocument();
    expect(screen.getByText('Importado desde archivo')).toBeInTheDocument();
    expect(screen.getByText(/Pendiente · importado sin autorización/)).toBeInTheDocument();
  });

  it('un alta a mano no lleva la marca de importado', () => {
    render(<PatientDataPanel patient={patient({ importBatchId: null, occupation: 'Docente' })} />);
    expect(screen.queryByText('Importado desde archivo')).not.toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
  });
});

describe('PatientDataPanel · maquetación', () => {
  it('un correo largo sin espacios parte la línea en vez de ensanchar la ficha a 390 px', () => {
    // jsdom no maqueta: se fija lo que lo hace posible. Sin `min-w-0` la celda
    // de la rejilla mide lo que el correo entero y `<main>` se desplaza en
    // horizontal en móvil (QA G2G3, DX-328).
    const email = 'nombre.apellido.consultorio@una-empresa-de-nombre-largo.example.com';
    render(<PatientDataPanel patient={patient({ email })} />);
    const value = screen.getByText(email);
    expect(value).toHaveClass('break-words');
    expect(value.parentElement).toHaveClass('min-w-0');
  });
});
