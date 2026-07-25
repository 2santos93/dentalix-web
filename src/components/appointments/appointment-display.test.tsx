import { render, screen } from '@testing-library/react';
import {
  STATUS_BADGE_CLASSES,
  STATUS_LABELS,
  formatTimeRange,
  patientLabel,
  StatusBadge,
} from './appointment-display';
import type { Appointment, AppointmentStatus } from '@/lib/appointments/appointments-api';

const appointment: Appointment = {
  id: 'apt-1',
  tenantId: 't1',
  patientId: 'pat-1',
  providerId: 'prov-1',
  start: '2026-07-23T09:00:00.000Z',
  end: '2026-07-23T09:30:00.000Z',
  status: 'SCHEDULED',
  reason: null,
  notes: null,
  createdById: 'u1',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

describe('appointment-display (shared day/week agenda helpers)', () => {
  it('formatTimeRange renders an en-dash-joined es-locale HH:mm–HH:mm range', () => {
    const fmt = (iso: string) =>
      new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    expect(formatTimeRange(appointment.start, appointment.end)).toBe(
      `${fmt(appointment.start)}–${fmt(appointment.end)}`,
    );
  });

  it('patientLabel resolves the name from patientNames, falling back to the raw patientId', () => {
    expect(patientLabel(appointment, { 'pat-1': 'Ana García' })).toBe('Ana García');
    expect(patientLabel(appointment)).toBe('pat-1');
    expect(patientLabel(appointment, {})).toBe('pat-1');
  });

  it('gives each of the five statuses a distinct semantic-token color class (no raw color utilities)', () => {
    const statuses: AppointmentStatus[] = [
      'SCHEDULED',
      'CONFIRMED',
      'COMPLETED',
      'CANCELLED',
      'NO_SHOW',
    ];
    const classSets = statuses.map((s) => STATUS_BADGE_CLASSES[s]);
    expect(new Set(classSets).size).toBe(5);
    for (const cls of classSets) {
      expect(cls).not.toMatch(/-(red|blue|green|amber|yellow|violet|emerald|orange)-\d/);
      expect(cls).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    }
  });

  it('has an es label for every status', () => {
    const statuses: AppointmentStatus[] = [
      'SCHEDULED',
      'CONFIRMED',
      'COMPLETED',
      'CANCELLED',
      'NO_SHOW',
    ];
    for (const s of statuses) {
      expect(STATUS_LABELS[s]).toEqual(expect.any(String));
      expect(STATUS_LABELS[s].length).toBeGreaterThan(0);
    }
  });

  it('StatusBadge renders the status label with its badge class', () => {
    render(<StatusBadge status="CONFIRMED" />);
    const badge = screen.getByTestId('appointment-status-badge');
    expect(badge).toHaveTextContent(STATUS_LABELS.CONFIRMED);
    expect(badge.className).toContain(STATUS_BADGE_CLASSES.CONFIRMED);
  });
});
