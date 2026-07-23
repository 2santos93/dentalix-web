import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

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

// Fixed, distinctive time slot for the appointment — unlikely to collide
// with anything else created for this same brand-new provider/day.
const startTime = '10:15';
const endTime = '10:45';

test('create appointment via the UI -> appears in the day agenda, status change via the select persists after reload', async ({
  page,
}) => {
  // --- Register ---
  await page.goto('/register');

  await page.getByLabel('Nombre de la clínica').fill(clinicName);
  await page.getByLabel('Subdominio').fill(subdomain);
  await page.getByLabel('Nombre completo').fill(fullName);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);

  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  const registerError = page.locator('p[role="alert"]');
  await expect(page)
    .toHaveURL(/\/login$/, { timeout: 10_000 })
    .catch(async () => {
      const message = (await registerError.isVisible())
        ? await registerError.textContent()
        : 'unknown (no redirect, no visible alert)';
      throw new Error(`Register did not redirect to /login. API error: ${message}`);
    });

  // --- Login ---
  // localhost:3001 has no tenant subdomain, so LoginForm renders the
  // subdomain input in addition to email/password.
  await page.getByLabel('Subdominio de la clínica').fill(subdomain);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);

  await page.getByRole('button', { name: 'Iniciar sesión' }).click();

  const loginError = page.locator('p[role="alert"]');

  await expect
    .poll(
      async () => {
        if (await loginError.isVisible()) {
          const message = await loginError.textContent();
          throw new Error(`Login failed with API error: ${message}`);
        }
        const raw = await page.evaluate(() => localStorage.getItem('dentalix-auth'));
        if (!raw) return false;
        const parsed = JSON.parse(raw) as { state?: { accessToken?: string | null } };
        return Boolean(parsed.state?.accessToken);
      },
      { timeout: 10_000, message: 'expected a persisted accessToken after login' },
    )
    .toBe(true);

  // LoginForm fires `router.push('/dashboard')` right after persisting the
  // tokens — that client-side navigation can still be in flight when we
  // issue our own `page.goto` below, which would abort it
  // (net::ERR_ABORTED). Let it settle first (that route may 404, that's
  // fine — we only need the in-flight navigation resolved).
  await page.waitForURL(/\/dashboard$/, { timeout: 5_000 }).catch(() => {});

  // --- Create the patient we'll book an appointment for ---
  await page.goto('/patients/new');
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
  await page.goto('/agenda');
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
  await appointmentForm
    .getByLabel('Paciente', { exact: true })
    .selectOption({ label: `${patientFirstName} ${patientLastName}` });
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
  await expect(appointmentRow).toContainText('10:15');
  await expect(appointmentRow).toContainText('10:45');
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
  await expect(appointmentRowAfterReload).toContainText('10:15');
  await expect(appointmentRowAfterReload).toContainText('10:45');
  await expect(appointmentRowAfterReload).toContainText(`${patientFirstName} ${patientLastName}`);
  await expect(appointmentRowAfterReload.getByTestId('appointment-status-badge')).toHaveText(
    'Confirmada',
  );
  await expect(appointmentRowAfterReload.getByLabel(/Estado de la cita de/i)).toHaveValue(
    'CONFIRMED',
  );
});
