import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { registerAndLogin } from './support/auth';

/**
 * e2e: register clinic + login, create a patient through the real UI, go to
 * `/agenda`, create a new appointment through `AppointmentForm` (patient +
 * provider=self/OWNER + start/end time + reason) and verify:
 *   - it appears in the day agenda (`DayAgenda`) with the right time range,
 *     patient name, reason and `SCHEDULED` status badge;
 *   - using `DayAgenda`'s status `<select>` to change it to CONFIRMED
 *     updates the badge (real `PATCH /appointments/:id` round-trip via
 *     `AgendaView.handleStatusChange` -> `updateAppointment`);
 * ...and that BOTH the appointment and its changed (CONFIRMED) status survive
 * a full page reload (real backend round-trip, no mocks) — proving Task
 * 5/6/6b (Fase 3, including the "cambiar estado" DoD item) end to end.
 *
 * Status-change step (brief step 6, "cambiar estado a Confirmada"): this used
 * to be a documented gap (`DayAgenda` had no control, see git history) —
 * fixed by Task 6b, which added a labeled status `<select>` per row
 * (`DayAgenda`'s `onStatusChange`/`updatingId` props, wired by `AgendaView`).
 * This spec now exercises that control for real instead of only asserting
 * the read-only badge.
 *
 * Requires both servers up:
 *   - backend  http://localhost:3000  (dentalix-api, `npm run start:dev`, Docker DB on :5442)
 *   - frontend http://localhost:3001  (dentalix-web, managed by Playwright's `webServer`)
 *
 * Auth: the backend resolves the tenant from the REQUEST HOST, so the whole
 * flow runs on `http://${subdomain}.localhost:3001` (see `./support/auth`),
 * not the shared `baseURL` (`http://localhost:3001`, which has no tenant).
 *
 * Uniqueness: subdomain/email/patient last name are suffixed with
 * `E2E_RUN_SUFFIX`, an env var set by the `test:e2e` npm script (see
 * package.json) so repeated runs never collide with previously-created
 * data. A local `npx playwright test` invocation (without the npm script)
 * falls back to `crypto.randomUUID()`. `RegisterDto.subdomain` requires
 * `/^[a-z0-9-]+$/`, so the suffix is kept lowercase-alphanumeric only.
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase();
const clinicName = `Test Clinic Agenda ${suffix}`;
const subdomain = `test-clinic-age-${suffix}`;
const fullName = 'Test User';
const email = `test.user.agenda.${suffix}@example.com`;
const password = 'Password123!';

const patientFirstName = 'Camila';
const patientLastName = `Agenda${suffix}`;
const patientDocNumber = `DOCAGE${suffix}`;

const appointmentReason = `Control rutinario ${suffix}`;

// Slot for the appointment: a time LATER TODAY, not a fixed clock time. The app
// now rejects booking in the past, so a hardcoded '10:15' failed every run after
// 10:15. It stays on TODAY (not tomorrow) because the day agenda below asserts
// the appointment shows up on the currently-viewed day, which the form pre-fills
// with today via `defaultDate`. Minutes are offset by a distinctive amount so the
// slot is unlikely to collide with anything else for this brand-new provider/day.
// Caveat: a run started within ~2h of midnight would wrap past midnight; e2e runs
// are not scheduled then.
function hhmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
const startAt = new Date(Date.now() + 61 * 60 * 1000);
const endAt = new Date(startAt.getTime() + 30 * 60 * 1000);
const startTime = hhmm(startAt);
const endTime = hhmm(endAt);

test('create appointment via the UI -> appears in the day agenda, status change via the select persists after reload', async ({
  page,
}) => {
  const origin = await registerAndLogin(page, { subdomain, clinicName, fullName, email, password });

  // --- Create the patient we'll book an appointment for ---
  await page.goto(`${origin}/patients/new`);
  await expect(page).toHaveURL(/\/patients\/new$/);

  await page.getByLabel('Nombre', { exact: true }).fill(patientFirstName);
  await page.getByLabel('Apellido', { exact: true }).fill(patientLastName);
  await page.getByLabel('Número de documento').fill(patientDocNumber);
  await page.getByLabel('Sexo').selectOption('F');

  const createPatientError = page.locator('p[role="alert"]');
  await page.getByRole('button', { name: 'Crear paciente' }).click();

  await expect(page)
    .toHaveURL(/\/patients$/, { timeout: 10_000 })
    .catch(async () => {
      const message = (await createPatientError.isVisible())
        ? await createPatientError.textContent()
        : 'unknown (no redirect, no visible alert)';
      throw new Error(`Create patient did not redirect to /patients. API error: ${message}`);
    });

  // --- Go to the agenda ---
  await page.goto(`${origin}/agenda`);
  await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible();

  // Brand-new clinic/provider/day -> nothing scheduled yet.
  await expect(page.getByRole('status').filter({ hasText: 'No hay citas para este día.' })).toBeVisible({
    timeout: 10_000,
  });

  // --- Open the "new appointment" form ---
  await page.getByRole('button', { name: 'Nueva cita' }).click();
  const appointmentForm = page.getByRole('form', { name: 'Agendar cita' });
  await expect(appointmentForm).toBeVisible();

  // --- Fill it: patient, provider (the registered owner, self), same day
  // currently viewed (pre-filled by `defaultDate`), start/end time, reason ---
  // Typing the exact document number auto-selects the matching patient
  // (documents are unique) — no list to pick from. Gate on the chosen-patient
  // chip's "Cambiar" button, NOT the name text: the name also appears in the
  // (unfiltered) results list that renders before the debounced search +
  // auto-select land, so waiting on the name alone races ahead of the actual
  // selection and submits with no patient set ("Completa paciente…").
  await appointmentForm.getByLabel('Paciente', { exact: true }).fill(patientDocNumber);
  await expect(appointmentForm.getByRole('button', { name: 'Cambiar' })).toBeVisible({
    timeout: 10_000,
  });
  await expect(appointmentForm.getByText(`${patientFirstName} ${patientLastName}`)).toBeVisible();
  await appointmentForm.getByLabel('Profesional', { exact: true }).selectOption({ label: fullName });
  await appointmentForm.getByLabel('Hora de inicio').fill(startTime);
  await appointmentForm.getByLabel('Hora de fin').fill(endTime);
  await appointmentForm.getByLabel('Motivo (opcional)').fill(appointmentReason);

  const saveError = appointmentForm.locator('p[role="alert"]');
  await appointmentForm.getByRole('button', { name: 'Agendar cita' }).click();

  // Successful creation collapses the inline form (`AgendaView.handleAppointmentCreated`
  // sets `showForm(false)`) and refreshes the day list in place.
  await expect(appointmentForm)
    .toBeHidden({ timeout: 10_000 })
    .catch(async () => {
      const message = (await saveError.isVisible()) ? await saveError.textContent() : 'unknown (no visible alert)';
      throw new Error(`Create appointment did not complete. API error: ${message}`);
    });

  // --- The new appointment appears in the day agenda: right time, patient,
  // reason and SCHEDULED ("Agendada") status ---
  const appointmentRow = page.locator('table tr', { hasText: appointmentReason });
  await expect(appointmentRow).toBeVisible({ timeout: 10_000 });
  await expect(appointmentRow).toContainText(startTime);
  await expect(appointmentRow).toContainText(endTime);
  await expect(appointmentRow).toContainText(`${patientFirstName} ${patientLastName}`);
  await expect(appointmentRow.getByTestId('appointment-status-badge')).toHaveText('Agendada');

  // --- Change status via `DayAgenda`'s status <select> (Task 6b): SCHEDULED
  // ("Agendada") -> CONFIRMED ("Confirmada"). `AgendaView.handleStatusChange`
  // PATCHes the appointment and refreshes the day list in place — assert the
  // badge reflects the change (real backend round-trip, no mocks). ---
  const statusSelect = appointmentRow.getByLabel(/Estado de la cita de/i);
  await statusSelect.selectOption({ label: 'Confirmada' });

  await expect(appointmentRow.getByTestId('appointment-status-badge')).toHaveText('Confirmada', {
    timeout: 10_000,
  });
  await expect(statusSelect).toHaveValue('CONFIRMED');

  // --- Reload: the appointment and its now-CONFIRMED status persist ---
  // The active day/provider selection is local component state, not
  // persisted across a reload -> `AgendaView` comes back defaulting to
  // today + the first active staff member (the same provider we booked
  // under), so the freshly-created appointment is still the one shown.
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible();

  const appointmentRowAfterReload = page.locator('table tr', { hasText: appointmentReason });
  await expect(appointmentRowAfterReload).toBeVisible({ timeout: 10_000 });
  await expect(appointmentRowAfterReload).toContainText(startTime);
  await expect(appointmentRowAfterReload).toContainText(endTime);
  await expect(appointmentRowAfterReload).toContainText(`${patientFirstName} ${patientLastName}`);
  await expect(appointmentRowAfterReload.getByTestId('appointment-status-badge')).toHaveText(
    'Confirmada',
  );
  await expect(appointmentRowAfterReload.getByLabel(/Estado de la cita de/i)).toHaveValue(
    'CONFIRMED',
  );
});
