import { render, screen, within } from '@testing-library/react';
import { PatientsTable } from './patients-table';
import type { Patient } from '@/lib/patients/patients-api';

const patients: Patient[] = [
  {
    id: '1',
    tenantId: 't1',
    firstName: 'Ana',
    lastName: 'García',
    docType: 'NATIONAL_ID',
    docNumber: '123456',
    birthDate: '1990-05-10T00:00:00.000Z',
    sex: 'F',
    phone: '3001234567',
    phoneInternational: '+57 300 1234567',
    email: 'ana@example.com',
    address: null,
    notes: null,
    coverage: { status: 'EXPIRED', payerName: 'Sura EPS', planName: null, validTo: '2026-01-01' },
    createdById: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: '2',
    tenantId: 't1',
    firstName: 'Luis',
    lastName: 'Pérez',
    docType: 'NATIONAL_ID',
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

function mockPhone(matches: boolean) {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

describe('PatientsTable', () => {
  it('en tablet/escritorio es UNA tabla: una fila y un enlace a la ficha por paciente', () => {
    render(<PatientsTable patients={patients} loading={false} />);

    const table = screen.getByRole('table', { name: 'Pacientes' });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Ana García' })).toHaveAttribute('href', '/patients/1');
    // Sin la lista del teléfono duplicada en el DOM.
    expect(screen.getAllByText('Ana García')).toHaveLength(1);
  });

  it('columnas: nombre, documento, edad, teléfono, cobertura, última atención (sin correo)', () => {
    render(<PatientsTable patients={patients} loading={false} />);
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Nombre',
      'Documento',
      'Edad',
      'Teléfono',
      'Cobertura',
      'Última atención',
    ]);
    expect(screen.queryByText('ana@example.com')).not.toBeInTheDocument();
  });

  it('shows the international phone of the API, or the stored one when it has none (DX-387)', () => {
    const stored = { ...patients[1], id: '3', phone: 'casa: 2345', phoneInternational: null };
    render(<PatientsTable patients={[patients[0], stored]} loading={false} />);
    expect(screen.getAllByText('+57 300 1234567')).toHaveLength(1);
    expect(screen.queryByText('3001234567')).not.toBeInTheDocument();
    expect(screen.getAllByText('casa: 2345')).toHaveLength(1);
  });

  it('a long phone wraps in its cell and in the phone card instead of widening them (DX-387)', () => {
    const phone = '+58 412 1234567 ext. 123456';
    const rows = [{ ...patients[0], phoneInternational: phone }];
    const { unmount } = render(<PatientsTable patients={rows} loading={false} />);
    const cell = screen.getByText(phone);
    expect(cell).toHaveClass('[overflow-wrap:anywhere]');
    expect(cell).toHaveClass('min-w-0');
    unmount();
    const restore = mockPhone(true);
    try {
      render(<PatientsTable patients={rows} loading={false} />);
      const card = screen.getByText(phone);
      expect(card).toHaveClass('[overflow-wrap:anywhere]');
      expect(card).toHaveClass('min-w-0');
    } finally {
      restore();
    }
  });

  it('el documento usa .t-id (cero con barra) y la edad sale de la fecha de nacimiento', () => {
    render(<PatientsTable patients={patients} loading={false} />);
    expect(screen.getByText('123456')).toHaveClass('t-id');
    expect(screen.getByText(/^\d+ años$/)).toBeInTheDocument();
  });

  it('la cobertura vencida se distingue; sin cobertura, guion', () => {
    render(<PatientsTable patients={patients} loading={false} />);
    expect(screen.getByText('Sura EPS · cobertura vencida')).toHaveClass('text-danger-text');
  });

  it('el avatar es neutro (nunca el acento)', () => {
    const { container } = render(<PatientsTable patients={patients} loading={false} />);
    const avatar = container.querySelector('span[aria-hidden].rounded-full')!;
    expect(avatar).toHaveClass('bg-surface-active');
    expect(avatar.className).not.toMatch(/primary/);
  });

  it('en el teléfono, tarjeta compacta: nombre + edad / documento · teléfono, toda la tarjeta abre la ficha', () => {
    const restore = mockPhone(true);
    try {
      render(<PatientsTable patients={patients} loading={false} />);
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      const [ana, luis] = within(screen.getByRole('list', { name: 'Pacientes' })).getAllByRole('listitem');
      expect(ana).toHaveTextContent(/^AGAna García\d+ años123456 · \+57 300 1234567$/);
      expect(within(ana).getByRole('link')).toHaveAttribute('href', '/patients/1');
      // Sin teléfono no hay « · » colgando ni «—».
      expect(luis).toHaveTextContent(/^LPLuis Pérez987654$/);
    } finally {
      restore();
    }
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
