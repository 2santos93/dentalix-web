import { test, expect } from './support/test';
import { randomUUID } from 'node:crypto';
import { registerAndLogin } from './support/auth';
import { disableBusinessHours } from './support/business-hours';
import { atSede, sedeDayFromToday } from './support/clock';

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
 * Requires both servers up (see playwright.config.ts and scripts/e2e-ci.sh):
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
const fullName = 'Test User';
const password = 'Password123!';
const patientFirstName = 'Camila';

/**
 * Hora fija, no la del reloj real (DX-070, TST-008). Antes el spec agendaba a
 * «ahora + 61 min» formateado en la zona de Node, así que a partir de las 22:30
 * la cita caía al día siguiente y en un runner UTC la hora divergía 5 h de la
 * que pinta la UI (America/Bogota, la zona de la sede y del config).
 *
 * Ahora:
 * - la cita va a las 10:15–10:45 de un DÍA ANCLA, pasado mañana en Bogotá:
 *   siempre futuro para la API (que rechaza agendar en el pasado con SU reloj)
 *   y nunca "hoy" para el navegador, sea la hora que sea;
 * - el reloj del NAVEGADOR (`page.clock`) se pone en hoy a las 23:30 y a las
 *   06:00 de Bogotá, una ejecución por hora: las dos horas en las que el spec
 *   anterior fallaba o rozaba el cambio de día. La agenda arranca en "hoy" y se
 *   salta al día ancla con el selector «Fecha».
 */
const today = sedeDayFromToday(0);
const anchorDay = sedeDayFromToday(2);
const startTime = '10:15';
const endTime = '10:45';

for (const browserClock of ['23:30', '06:00']) {
  const tag = browserClock.replace(':', '');
  const clinicName = `Test Clinic Agenda ${tag} ${suffix}`;
  const subdomain = `test-clinic-age-${tag}-${suffix}`;
  const email = `test.user.agenda.${tag}.${suffix}@example.com`;
  const patientLastName = `Agenda${tag}${suffix}`;
  const patientDocNumber = `DOCAGE${tag}${suffix}`.slice(0, 20);
  const appointmentReason = `Control rutinario ${tag} ${suffix}`;

  test(`create appointment via the UI -> appears in the day agenda, status change via the select persists after reload (reloj del navegador a las ${browserClock})`, async ({
    page,
  }) => {
    await page.clock.install({ time: atSede(today, browserClock) });
    const origin = await registerAndLogin(page, { subdomain, clinicName, fullName, email, password });
    await disableBusinessHours(page, origin);

    // --- Create the patient we'll book an appointment for ---
    await page.goto(`${origin}/patients/new`);
    await expect(page).toHaveURL(/\/patients\/new$/);

    await page.getByLabel('Nombre', { exact: true }).fill(patientFirstName);
    await page.getByLabel('Apellido', { exact: true }).fill(patientLastName);
    await page.getByLabel('Número de documento').fill(patientDocNumber);
    await page.getByLabel('Sexo').selectOption('F');

    const createPatientError = page.locator('p[role="alert"]');
    // El alta de paciente es un WIZARD de 5 pasos y el submit ("Guardar") vive en
    // el último; con nombre+apellido llenos se puede saltar directo al final (ver
    // `goToStep` en patient-create-wizard.tsx). Antes esto pulsaba un botón "Crear
    // paciente" que ya no existe, y el spec se colgaba 30s en el click.
    await page.getByRole('button', { name: /Autorización de datos/ }).click();
    await page.getByRole('button', { name: 'Guardar' }).click();

    // El wizard redirige al DETALLE del paciente recién creado
    // (patient-create-wizard.tsx: `router.push(`/patients/${created.id}`)`), no a
    // la lista como hacía el formulario anterior.
    await expect(page)
      .toHaveURL(/\/patients\/[^/]+$/, { timeout: 10_000 })
      .catch(async () => {
        const message = (await createPatientError.isVisible())
          ? await createPatientError.textContent()
          : 'unknown (no redirect, no visible alert)';
        throw new Error(`Create patient did not land on the patient detail page. API error: ${message}`);
      });

    // --- Go to the agenda ---
    await page.goto(`${origin}/agenda`);
    await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible();

    // La agenda arranca en vista MES (agenda-view.tsx: useState<ViewMode>('month')),
    // así que hay que pasar a "Día" para que se renderice `DayAgenda` — es la vista
    // cuyo estado vacío y cuya tabla asevera este spec.
    await page.getByRole('button', { name: 'Día', exact: true }).click();
    // La agenda abre en el "hoy" del navegador; se salta al día ancla.
    await page.getByLabel('Fecha', { exact: true }).fill(anchorDay);

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
    // El formulario hereda el día que se está viendo (`defaultDate`): el ancla.
    await expect(appointmentForm.getByLabel('Fecha', { exact: true })).toHaveValue(anchorDay);
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
    await expect(appointmentRow.getByLabel(/Estado de la cita de/i)).toHaveValue('SCHEDULED');

    // --- Change status via `DayAgenda`'s status <select> (Task 6b): SCHEDULED
    // ("Agendada") -> CONFIRMED ("Confirmada"). `AgendaView.handleStatusChange`
    // PATCHes the appointment and refreshes the day list in place — assert the
    // badge reflects the change (real backend round-trip, no mocks). ---
    const statusSelect = appointmentRow.getByLabel(/Estado de la cita de/i);
    await statusSelect.selectOption({ label: 'Confirmada' });

    await expect(statusSelect).toHaveValue('CONFIRMED', { timeout: 10_000 });

    // --- Reload: the appointment and its now-CONFIRMED status persist ---
    // The active day/provider selection is local component state, not
    // persisted across a reload -> `AgendaView` comes back defaulting to
    // today + the first active staff member (the same provider we booked
    // under); jumping back to the anchor day shows the appointment again.
    await page.reload();

    await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible();

    // `viewMode` no se persiste: el reload vuelve a la vista MES por defecto, y
    // el día vuelve a ser el "hoy" del navegador.
    await page.getByRole('button', { name: 'Día', exact: true }).click();
    await page.getByLabel('Fecha', { exact: true }).fill(anchorDay);

    const appointmentRowAfterReload = page.locator('table tr', { hasText: appointmentReason });
    await expect(appointmentRowAfterReload).toBeVisible({ timeout: 10_000 });
    await expect(appointmentRowAfterReload).toContainText(startTime);
    await expect(appointmentRowAfterReload).toContainText(endTime);
    await expect(appointmentRowAfterReload).toContainText(`${patientFirstName} ${patientLastName}`);
    await expect(appointmentRowAfterReload.getByLabel(/Estado de la cita de/i)).toHaveValue(
      'CONFIRMED',
    );
  });
}
