import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatientRecordHeader } from './patient-record-header';
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
    insurerEps: null,
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

describe('PatientRecordHeader', () => {
  it('pone el nombre del paciente en el h1 de la página', () => {
    render(<PatientRecordHeader patient={patient()} loading={false} onEdit={() => {}} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Carlos Mejía');
  });

  it('saca edad, documento y teléfono a la cabecera, sin abrir ninguna pestaña', () => {
    render(
      <PatientRecordHeader
        patient={patient({ phone: '+57 300 000 0000' })}
        loading={false}
        onEdit={() => {}}
      />,
    );
    const strip = screen.getByRole('list', { name: /datos de identificación/i });
    expect(strip).toHaveTextContent(/años/);
    expect(strip).toHaveTextContent('CC 1002');
    expect(strip).toHaveTextContent('Tel. +57 300 000 0000');
  });

  it('omite entero el dato que falta en vez de dejar un marcador vacío', () => {
    render(
      <PatientRecordHeader
        patient={patient({ birthDate: null, docNumber: null, phone: '+57 300 000 0000' })}
        loading={false}
        onEdit={() => {}}
      />,
    );
    const strip = screen.getByRole('list', { name: /datos de identificación/i });
    expect(strip).toHaveTextContent('Tel. +57 300 000 0000');
    expect(strip).not.toHaveTextContent('—');
    expect(strip).not.toHaveTextContent(/años/);
    expect(strip).not.toHaveTextContent('CC');
  });

  it('no pinta la tira cuando no hay ni un dato que poner', () => {
    render(
      <PatientRecordHeader
        patient={patient({ birthDate: null, docNumber: null, phone: null })}
        loading={false}
        onEdit={() => {}}
      />,
    );
    expect(screen.queryByRole('list', { name: /datos de identificación/i })).not.toBeInTheDocument();
  });

  it('afirma que la ficha es centralizada, también mientras carga', () => {
    // El alcance es una propiedad de la ficha, no del paciente que se esté
    // cargando: verificado en el backend, `listByPlan`/`listByPatient` NO
    // filtran por sede a propósito. La marca lo declara en vez de dejar que
    // el usuario lo deduzca.
    const { rerender } = render(
      <PatientRecordHeader patient={null} loading onEdit={() => {}} />,
    );
    expect(screen.getByText(/ficha centralizada · todas las sedes/i)).toBeInTheDocument();

    rerender(<PatientRecordHeader patient={patient()} loading={false} onEdit={() => {}} />);
    expect(screen.getByText(/ficha centralizada · todas las sedes/i)).toBeInTheDocument();
  });

  it('mientras carga anuncia la carga y no ofrece editar', () => {
    render(<PatientRecordHeader patient={null} loading onEdit={() => {}} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/cargando paciente/i);
    expect(screen.queryByRole('button', { name: /editar datos/i })).not.toBeInTheDocument();
  });

  it('deja un h1 real cuando el paciente no se pudo cargar', () => {
    render(<PatientRecordHeader patient={null} loading={false} onEdit={() => {}} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Paciente');
  });

  it('«Editar datos» es la única acción primaria y vive en la cabecera', async () => {
    const onEdit = jest.fn();
    const user = userEvent.setup();
    render(<PatientRecordHeader patient={patient()} loading={false} onEdit={onEdit} />);

    await user.click(screen.getByRole('button', { name: /editar datos/i }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('mantiene la vuelta a la lista de pacientes', () => {
    render(<PatientRecordHeader patient={patient()} loading={false} onEdit={() => {}} />);
    expect(screen.getByRole('link', { name: /volver a pacientes/i })).toHaveAttribute(
      'href',
      '/patients',
    );
  });
});

describe('PatientRecordHeader · saldo vencido (DX-150)', () => {
  it('muestra el chip con el importe que manda la API (ADMIN/RECEPTION)', () => {
    render(
      <PatientRecordHeader
        patient={patient({
          balance: { hasOverdue: true, overdueDays: 75, amounts: [{ currency: 'COP', amount: 300000 }] },
        })}
        loading={false}
        onEdit={() => {}}
      />,
    );
    expect(screen.getByTestId('overdue-chip').textContent?.replace(/\s/g, ' ')).toMatch(
      /^Saldo vencido · 75 días · .*300\.000/,
    );
  });

  it('sin importe para DENTIST/ASSISTANT y sin chip si no hay saldo vencido', () => {
    const { rerender } = render(
      <PatientRecordHeader
        patient={patient({ balance: { hasOverdue: true, overdueDays: 5 } })}
        loading={false}
        onEdit={() => {}}
      />,
    );
    expect(screen.getByTestId('overdue-chip')).toHaveTextContent(/^Saldo vencido · 5 días$/);
    rerender(
      <PatientRecordHeader
        patient={patient({ balance: { hasOverdue: false, overdueDays: null } })}
        loading={false}
        onEdit={() => {}}
      />,
    );
    expect(screen.queryByTestId('overdue-chip')).toBeNull();
  });
});

describe('PatientRecordHeader · cobertura vencida (DX-153)', () => {
  const coverage = (status: 'NONE' | 'ACTIVE' | 'EXPIRED' | 'NOT_STARTED') => ({
    status,
    payerName: 'Sanitas',
    planName: null,
    validTo: '2026-01-31',
  });

  it('muestra el chip con una cobertura vencida', () => {
    render(
      <PatientRecordHeader
        patient={patient({ coverage: coverage('EXPIRED') })}
        loading={false}
        onEdit={() => {}}
      />,
    );
    expect(screen.getByTestId('coverage-chip')).toHaveTextContent('Cobertura vencida');
  });

  it.each(['ACTIVE', 'NONE', 'NOT_STARTED'] as const)('no lo muestra con %s', (status) => {
    render(
      <PatientRecordHeader
        patient={patient({ coverage: coverage(status) })}
        loading={false}
        onEdit={() => {}}
      />,
    );
    expect(screen.queryByTestId('coverage-chip')).not.toBeInTheDocument();
  });

  it('convive con el chip de saldo vencido', () => {
    render(
      <PatientRecordHeader
        patient={patient({
          coverage: coverage('EXPIRED'),
          balance: { hasOverdue: true, overdueDays: 10 },
        })}
        loading={false}
        onEdit={() => {}}
      />,
    );
    expect(screen.getByTestId('coverage-chip')).toBeInTheDocument();
    expect(screen.getByTestId('overdue-chip')).toBeInTheDocument();
  });
});


describe('PatientRecordHeader · chip de convenio (DX-105)', () => {
  const agreement = (status: 'NONE' | 'ACTIVE' | 'EXPIRED' | 'NOT_STARTED' | 'INACTIVE') => ({
    status,
    agreementName: 'Sanitas 2026',
    payerName: 'Sanitas',
  });

  it('muestra «Convenio: nombre» con un convenio vigente', () => {
    render(
      <PatientRecordHeader
        patient={patient({ agreement: agreement('ACTIVE') })}
        loading={false}
        onEdit={() => {}}
      />,
    );
    expect(screen.getByTestId('agreement-chip')).toHaveTextContent('Convenio: Sanitas 2026');
  });

  it.each(['NONE', 'EXPIRED', 'NOT_STARTED', 'INACTIVE'] as const)(
    'no lo muestra con %s',
    (status) => {
      render(
        <PatientRecordHeader
          patient={patient({ agreement: agreement(status) })}
          loading={false}
          onEdit={() => {}}
        />,
      );
      expect(screen.queryByTestId('agreement-chip')).not.toBeInTheDocument();
    },
  );

  it('convive con el chip de cobertura vencida', () => {
    render(
      <PatientRecordHeader
        patient={patient({
          agreement: agreement('ACTIVE'),
          coverage: { status: 'EXPIRED', payerName: 'Sanitas', planName: null, validTo: '2026-01-31' },
        })}
        loading={false}
        onEdit={() => {}}
      />,
    );
    expect(screen.getByTestId('agreement-chip')).toBeInTheDocument();
    expect(screen.getByTestId('coverage-chip')).toBeInTheDocument();
  });
});

describe('PatientRecordHeader: alerta médica (DX-247)', () => {
  const flags = {
    hasCriticalAlert: true,
    requiresPremedication: true,
    anamnesisStatus: 'CURRENT' as const,
    alerts: ['profilaxisAntibiotica' as const],
    anamnesisReviewedAt: '2026-09-01T00:00:00.000Z',
  };

  it('la cabecera (que encabeza el plan y el odontograma) muestra la alerta con su titular', async () => {
    const user = userEvent.setup();
    render(<PatientRecordHeader patient={patient()} loading={false} onEdit={() => {}} medicalAlerts={flags} />);
    expect(screen.getByTestId('record-medical-alert')).toHaveTextContent('Requiere premedicación');
    await user.click(screen.getByRole('button', { name: 'Alertas médicas de Carlos Mejía' }));
    expect(screen.getByTestId('medical-alert-popover')).toHaveTextContent('Requiere profilaxis antibiótica');
  });

  it('sin anamnesis lo dice; al día y sin alertas no pinta nada', () => {
    const { rerender } = render(
      <PatientRecordHeader
        patient={patient()}
        loading={false}
        onEdit={() => {}}
        medicalAlerts={{ ...flags, hasCriticalAlert: false, requiresPremedication: false, alerts: [], anamnesisStatus: 'MISSING' }}
      />,
    );
    expect(screen.getByTestId('record-medical-alert')).toHaveTextContent('Sin anamnesis');
    rerender(
      <PatientRecordHeader
        patient={patient()}
        loading={false}
        onEdit={() => {}}
        medicalAlerts={{ ...flags, hasCriticalAlert: false, requiresPremedication: false, alerts: [] }}
      />,
    );
    expect(screen.queryByTestId('record-medical-alert')).not.toBeInTheDocument();
  });
});

describe('PatientRecordHeader: alertas sin comprobar (DX-247)', () => {
  it('mientras carga dice «Comprobando alertas…»; si falla, «Alertas sin comprobar» con reintento', async () => {
    const user = userEvent.setup();
    const onRetry = jest.fn();
    const { rerender } = render(
      <PatientRecordHeader patient={patient()} loading={false} onEdit={() => {}} medicalAlerts={null} />,
    );
    expect(screen.getByText('Comprobando alertas…')).toBeInTheDocument();
    rerender(
      <PatientRecordHeader
        patient={patient()}
        loading={false}
        onEdit={() => {}}
        medicalAlerts={null}
        medicalAlertsFailed
        onRetryMedicalAlerts={onRetry}
      />,
    );
    expect(screen.queryByText('Comprobando alertas…')).not.toBeInTheDocument();
    expect(screen.getByText('Alertas sin comprobar')).toBeInTheDocument();
    expect(screen.queryByTestId('record-medical-alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe('PatientRecordHeader: insignia de asistencia (DX-279)', () => {
  const summary = (noShows: number, lateCancellations: number) => ({
    patientId: 'p1',
    since: '2025-10-23T00:00:00.000Z',
    until: '2026-10-23T00:00:00.000Z',
    totals: { appointments: 8, noShows, lateCancellations },
    byLocation: [],
  });

  it('muestra «2 inasistencias · 1 cancelación tardía (12 meses)»', () => {
    render(
      <PatientRecordHeader patient={patient()} loading={false} onEdit={() => {}} attendance={summary(2, 1)} />,
    );
    expect(screen.getByTestId('attendance-badge')).toHaveTextContent(
      '2 inasistencias · 1 cancelación tardía (12 meses)',
    );
  });

  it('sin incidencias no hay insignia; mientras carga solo lo anuncia', () => {
    const { rerender } = render(
      <PatientRecordHeader patient={patient()} loading={false} onEdit={() => {}} attendance={null} />,
    );
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Comprobando inasistencias…');
    rerender(
      <PatientRecordHeader patient={patient()} loading={false} onEdit={() => {}} attendance={summary(0, 0)} />,
    );
    expect(screen.queryByTestId('attendance-badge')).not.toBeInTheDocument();
    expect(screen.queryByText('Comprobando inasistencias…')).not.toBeInTheDocument();
  });

  it('si falla, «Asistencia sin comprobar» con reintento', async () => {
    const user = userEvent.setup();
    const onRetry = jest.fn();
    render(
      <PatientRecordHeader
        patient={patient()}
        loading={false}
        onEdit={() => {}}
        attendance={null}
        attendanceFailed
        onRetryAttendance={onRetry}
      />,
    );
    expect(screen.getByText('Asistencia sin comprobar')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalled();
  });
});
