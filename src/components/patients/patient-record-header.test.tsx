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
    docType: 'NATIONAL_ID',
    docTypeLabel: null,
    docTypeName: 'ID local',
    docNumber: 'DOC-1002',
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
    expect(strip).toHaveTextContent('ID local DOC-1002');
    expect(strip).toHaveTextContent('Tel. +57 300 000 0000');
  });

  it('shows the international phone of the API, or the stored one when it has none (DX-387)', () => {
    const { rerender } = render(
      <PatientRecordHeader
        patient={patient({ phone: '0412-1234567', phoneInternational: '+58 412 1234567' })}
        loading={false}
        onEdit={() => {}}
      />,
    );
    expect(screen.getByText('Tel. +58 412 1234567')).toBeInTheDocument();
    expect(screen.queryByText(/0412-1234567/)).not.toBeInTheDocument();
    rerender(
      <PatientRecordHeader
        patient={patient({ phone: 'llamar por la tarde', phoneInternational: null })}
        loading={false}
        onEdit={() => {}}
      />,
    );
    expect(screen.getByText('Tel. llamar por la tarde')).toBeInTheDocument();
  });

  it('a long phone wraps inside the strip instead of widening the header at 390 px (DX-387)', () => {
    const phone = '+58 412 1234567 ext. 123456';
    render(
      <PatientRecordHeader
        patient={patient({ phone: '04121234567x123456', phoneInternational: phone })}
        loading={false}
        onEdit={() => {}}
      />,
    );
    const value = screen.getByText(`Tel. ${phone}`);
    expect(value).toHaveClass('[overflow-wrap:anywhere]');
    expect(value.parentElement).toHaveClass('min-w-0');
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
    expect(strip).not.toHaveTextContent('ID local');
  });

  it('prints the docTypeName of the DTO, or the generic name when it is missing', () => {
    const { rerender } = render(
      <PatientRecordHeader
        patient={patient({ docTypeLabel: 'Documento A', docTypeName: 'Documento A' })}
        loading={false}
        onEdit={() => {}}
      />,
    );
    const strip = () => screen.getByRole('list', { name: /datos de identificación/i });
    expect(strip()).toHaveTextContent('Documento A DOC-1002');

    // API anterior en el hueco del despliegue: sin `docTypeName`, el genérico.
    rerender(
      <PatientRecordHeader
        patient={patient({ docType: 'PASSPORT', docTypeLabel: undefined, docTypeName: undefined })}
        loading={false}
        onEdit={() => {}}
      />,
    );
    expect(strip()).toHaveTextContent('Pasaporte DOC-1002');
    expect(strip()).not.toHaveTextContent('PASSPORT');
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
    payerName: 'Sanavida',
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
    agreementName: 'Sanavida 2026',
    payerName: 'Sanavida',
  });

  it('muestra «Convenio: nombre» con un convenio vigente', () => {
    render(
      <PatientRecordHeader
        patient={patient({ agreement: agreement('ACTIVE') })}
        loading={false}
        onEdit={() => {}}
      />,
    );
    expect(screen.getByTestId('agreement-chip')).toHaveTextContent('Convenio: Sanavida 2026');
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
          coverage: { status: 'EXPIRED', payerName: 'Sanavida', planName: null, validTo: '2026-01-31' },
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

describe('PatientRecordHeader: cabecera compacta (UX v2 · K3)', () => {
  const critical = {
    hasCriticalAlert: true,
    requiresPremedication: false,
    anamnesisStatus: 'EXPIRED' as const,
    alerts: ['anticoagulantes' as const, 'alergiaLatex' as const],
    anamnesisReviewedAt: '2025-01-01T00:00:00.000Z',
  };

  it('cada alerta clínica es un chip a la vista, y la anamnesis caducada se dice aparte', () => {
    render(<PatientRecordHeader patient={patient()} loading={false} onEdit={() => {}} medicalAlerts={critical} />);
    const lines = screen.getAllByTestId('record-alert-line');
    expect(lines).toHaveLength(2);
    expect(screen.getByRole('group', { name: 'Avisos del paciente' })).toHaveTextContent('Anamnesis caducada');
  });

  it('las acciones raras van en el menú «⋯», con su nombre accesible', async () => {
    const user = userEvent.setup();
    const onArchive = jest.fn();
    render(
      <PatientRecordHeader
        patient={patient()}
        loading={false}
        onEdit={() => {}}
        menuActions={[
          { label: 'Enviar anamnesis', onSelect: () => {} },
          { label: 'Archivar paciente', onSelect: onArchive, destructive: true, separatorBefore: true },
        ]}
      />,
    );
    expect(screen.queryByRole('menuitem', { name: 'Archivar paciente' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Más acciones' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Archivar paciente' }));
    expect(onArchive).toHaveBeenCalled();
  });

  it('sin acciones de menú no hay «⋯»; «Editar datos» sigue siendo la acción primaria', () => {
    render(<PatientRecordHeader patient={patient()} loading={false} onEdit={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Más acciones' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar datos' })).toBeInTheDocument();
  });

  it('la retención legal es un chip neutro al final de la fila', () => {
    render(
      <PatientRecordHeader
        patient={patient()}
        loading={false}
        onEdit={() => {}}
        retention={{ text: 'Retención hasta 28/02/2039', hint: 'Se conserva 15 años.' }}
      />,
    );
    expect(screen.getByTestId('record-retention')).toHaveTextContent('Retención hasta 28/02/2039');
  });
});
