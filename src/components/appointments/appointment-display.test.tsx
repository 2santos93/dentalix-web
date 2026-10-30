import { render, screen } from '@testing-library/react';
import {
  STATUS_BADGE_CLASSES,
  STATUS_LABELS,
  patientLabel,
  StatusBadge,
} from './appointment-display';
import type { Appointment, AppointmentStatus } from '@/lib/appointments/appointments-api';

const appointment: Appointment = {
  id: 'apt-1',
  tenantId: 't1',
  patientId: 'pat-1',
  patientFirstName: null,
  patientLastName: null,
  providerId: 'prov-1',
  start: '2026-07-23T09:00:00.000Z',
  end: '2026-07-23T09:30:00.000Z',
  status: 'SCHEDULED',
  reason: null,
  notes: null,
  createdById: 'u1',
  locationId: 'loc-1',
  appointmentTypeId: null,
  appointmentType: null,
  confirmationSentAt: null,
  callbackRequestedAt: null,
  wantsEarlier: false,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

describe('appointment-display (shared day/week agenda helpers)', () => {
  it('patientLabel resolves the name from patientNames, falling back to the raw patientId', () => {
    expect(patientLabel(appointment, { 'pat-1': 'Ana García' })).toBe('Ana García');
    expect(patientLabel(appointment)).toBe('pat-1');
    expect(patientLabel(appointment, {})).toBe('pat-1');
  });

  it('patientLabel prefers the name joined on the appointment — no lookup map needed', () => {
    const withName: Appointment = {
      ...appointment,
      patientFirstName: 'Ana',
      patientLastName: 'García',
    };
    // This is the case that used to break past the 100-patient cap: no map at
    // all, yet the row still shows a name instead of the UUID.
    expect(patientLabel(withName)).toBe('Ana García');
    // The joined name wins over a stale map entry.
    expect(patientLabel(withName, { 'pat-1': 'Nombre viejo' })).toBe('Ana García');
  });

  it('patientLabel copes with a half-populated name instead of rendering a stray space', () => {
    expect(patientLabel({ ...appointment, patientFirstName: 'Ana' })).toBe('Ana');
    expect(patientLabel({ ...appointment, patientLastName: 'García' })).toBe('García');
  });

  it('derives every status color from the status tone map — never the tenant accent nor raw colors', () => {
    for (const cls of Object.values(STATUS_BADGE_CLASSES)) {
      expect(cls).not.toMatch(/primary/);
      expect(cls).not.toMatch(/-(red|blue|green|amber|yellow|violet|emerald|orange)-\d/);
      expect(cls).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    }
    // Hecho, no asistió y confirmada se distinguen por tono.
    expect(new Set([STATUS_BADGE_CLASSES.COMPLETED, STATUS_BADGE_CLASSES.NO_SHOW, STATUS_BADGE_CLASSES.CONFIRMED]).size).toBe(3);
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

  it('StatusBadge renders the status label with the tone of the shared map', () => {
    render(<StatusBadge status="CONFIRMED" />);
    const badge = screen.getByTestId('appointment-status-badge');
    expect(badge).toHaveTextContent(STATUS_LABELS.CONFIRMED);
    expect(badge.className).toContain('bg-info-subtle');
    expect(badge.className).not.toContain('primary');
  });
});
