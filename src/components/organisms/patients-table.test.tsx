import { render, screen } from '@testing-library/react';
import { PatientsTable } from './patients-table';
import type { Patient } from '@/lib/patients/patients-api';

const patients: Patient[] = [
  {
    id: '1',
    tenantId: 't1',
    firstName: 'Ana',
    lastName: 'García',
    docType: 'CC',
    docNumber: '123456',
    birthDate: null,
    sex: 'F',
    phone: '3001234567',
    email: 'ana@example.com',
    address: null,
    notes: null,
    createdById: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: '2',
    tenantId: 't1',
    firstName: 'Luis',
    lastName: 'Pérez',
    docType: 'CC',
    docNumber: '987654',
    birthDate: null,
    sex: 'M',
    phone: null,
    email: null,
    address: null,
    notes: null,
    createdById: null,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
];

describe('PatientsTable', () => {
  it('renders a row per patient, in both the desktop table and the mobile cards', () => {
    render(<PatientsTable patients={patients} loading={false} />);

    // Desktop table
    expect(screen.getAllByText('Ana García')).toHaveLength(2); // table + mobile card
    expect(screen.getAllByText('Luis Pérez')).toHaveLength(2);
  });

  it('renders a desktop table hidden below md and mobile cards hidden at md+', () => {
    const { container } = render(<PatientsTable patients={patients} loading={false} />);
    const table = container.querySelector('table');
    expect(table).toBeInTheDocument();
    expect(table?.closest('.hidden.md\\:block')).toBeInTheDocument();

    const mobileWrapper = container.querySelector('.md\\:hidden');
    expect(mobileWrapper).toBeInTheDocument();
  });

  it('shows an empty state message when there are no patients', () => {
    render(<PatientsTable patients={[]} loading={false} />);
    expect(screen.getByText(/no hay pacientes|sin pacientes/i)).toBeInTheDocument();
  });

  it('shows a loading state instead of the empty message while loading', () => {
    render(<PatientsTable patients={[]} loading={true} />);
    expect(screen.queryByText(/no hay pacientes|sin pacientes/i)).not.toBeInTheDocument();
    expect(screen.getByText(/cargando/i)).toBeInTheDocument();
  });
});
