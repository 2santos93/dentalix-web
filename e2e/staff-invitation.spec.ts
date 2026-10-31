import { randomUUID } from 'node:crypto';
import { test, expect } from './support/test';
import { loginAs, sessionCookie } from './support/auth';
import { registerClinicViaApi } from './support/api';
import { invitationLinkFor } from './support/mail';
import { E2E_BROWSER_LOCALE } from './support/regional';

/**
 * DX-070 (TST-004): invitar a una persona del equipo y que ACEPTE en otra
 * sesión.
 *
 *   1. El ADMIN, en /staff, invita a una odontóloga. DX-029: el diálogo
 *      «Invitación creada» ya NO muestra el enlace; solo llega al correo de
 *      la invitada (la suite lo lee del buzón de e2e).
 *   2. En OTRO contexto del navegador (otra persona, sin la cookie del ADMIN)
 *      se abre `/invitacion/[token]`: clínica, rol y correo enmascarado, se
 *      crea la contraseña y entra directo a la app con su propia sesión.
 *   3. El ADMIN ve al miembro «Activo»; el enlace ya no sirve («ya utilizada»);
 *      y la invitada puede volver a entrar con la contraseña que eligió.
 *
 * DX-088: la invitación sale además por correo (en e2e, ConsoleMailer): la
 * fila muestra «Correo: Enviado» y «Reenviar invitación» (con confirmación)
 * deja inservible el enlace anterior.
 *
 * La clínica se crea por la API (no es lo que se prueba aquí).
 */
const PASSWORD = 'Password123!';
const INVITEE_PASSWORD = 'Invitada2026!';

test('un ADMIN invita, otra sesión acepta en /invitacion/[token] y entra con su propia sesión', async ({
  page,
  browser,
  playwright,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const clinic = {
    subdomain: `invita-${suffix}`,
    clinicName: `Clínica Invita ${suffix}`,
    fullName: 'Dueña Invita',
    email: `invita.admin.${suffix}@example.com`,
    password: PASSWORD,
  };
  const invitee = { fullName: `Odontóloga ${suffix}`, email: `invitada.${suffix}@example.com` };

  const api = await playwright.request.newContext();
  const { origin } = await registerClinicViaApi(api, clinic);
  await api.dispose();

  // --- 1. El ADMIN invita desde /staff ---
  await loginAs(page, origin, clinic.email, clinic.password);
  await page.goto(`${origin}/staff`);
  await expect(page.getByRole('heading', { name: 'Personal' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Invitar' }).click();
  const form = page.getByRole('dialog', { name: 'Invitar a la clínica' });
  await form.getByLabel('Nombre completo').fill(invitee.fullName);
  await form.getByLabel('Correo electrónico').fill(invitee.email);
  await form.getByLabel('Rol').selectOption({ label: 'Odontólogo/a' });
  await form.getByRole('button', { name: 'Enviar invitación' }).click();

  const created = page.getByRole('dialog', { name: 'Invitación creada' });
  await expect(created).toBeVisible({ timeout: 10_000 });
  await expect(created.getByText(`Le enviamos un correo a ${invitee.email}`, { exact: false })).toBeVisible();
  await expect(created.getByText(/\/invitacion\//)).toHaveCount(0);
  const link = await invitationLinkFor(invitee.email);
  expect(link).toMatch(new RegExp(`^${origin}/invitacion/[0-9a-f]{64}$`));
  await created.getByRole('button', { name: 'Listo' }).click();
  const table = page.getByRole('table', { name: 'Personal de la clínica' });
  await expect(table).toContainText(invitee.email);
  // El despachador lo envía en segundo plano; la lista se pone al día sola.
  await expect(
    table.getByRole('row', { name: new RegExp(invitee.fullName) }),
  ).toContainText('Correo: Enviado', { timeout: 15_000 });

  // --- 2. Otra sesión (otro contexto, sin cookies del ADMIN) acepta ---
  const inviteeContext = await browser.newContext({
    locale: E2E_BROWSER_LOCALE,
    timezoneId: 'America/Bogota',
  });
  try {
    const other = await inviteeContext.newPage();
    await other.goto(link);
    await expect(other.getByText(clinic.clinicName).first()).toBeVisible({ timeout: 15_000 });
    await expect(other.getByText('Te invitaron como Odontólogo/a')).toBeVisible();
    await expect(other.getByText('Crea tu contraseña para activar tu cuenta.')).toBeVisible();
    // El correo va enmascarado: nunca entero en una página pública.
    await expect(other.getByText(invitee.email)).toHaveCount(0);

    await other.getByLabel('Contraseña', { exact: true }).fill(INVITEE_PASSWORD);
    await other.getByRole('button', { name: 'Aceptar invitación' }).click();
    await expect(other).toHaveURL(`${origin}/patients`, { timeout: 15_000 });
    await expect(other.getByRole('heading', { name: 'Pacientes' })).toBeVisible({ timeout: 15_000 });
    // Entra con SU sesión (cookie HttpOnly propia), no con la del ADMIN.
    expect((await sessionCookie(other, origin))?.httpOnly).toBe(true);
    await expect(
      other.getByRole('button', { name: new RegExp(invitee.fullName, 'i') }).first(),
    ).toBeVisible();

    // El enlace es de un solo uso.
    await other.goto(link);
    await expect(other.getByRole('heading', { name: 'Invitación ya utilizada' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(other.getByLabel('Contraseña', { exact: true })).toHaveCount(0);

    // Y la contraseña que eligió le sirve para volver a entrar.
    await inviteeContext.clearCookies();
    await loginAs(other, origin, invitee.email, INVITEE_PASSWORD);
    await expect(other.getByRole('heading', { name: 'Pacientes' })).toBeVisible({ timeout: 15_000 });
  } finally {
    await inviteeContext.close();
  }

  // --- 3. El ADMIN la ve aceptada ---
  await page.reload();
  const row = page.getByRole('table', { name: 'Personal de la clínica' }).getByRole('row', {
    name: new RegExp(invitee.fullName),
  });
  await expect(row).toContainText('Activo', { timeout: 15_000 });
  await expect(row).toContainText('Odontólogo/a');
});

test('«Reenviar invitación» pide confirmación, avisa y deja inservible el enlace anterior', async ({
  page,
  browser,
  playwright,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const clinic = {
    subdomain: `reenvia-${suffix}`,
    clinicName: `Clínica Reenvía ${suffix}`,
    fullName: 'Dueña Reenvía',
    email: `reenvia.admin.${suffix}@example.com`,
    password: PASSWORD,
  };
  const invitee = { fullName: `Asistente ${suffix}`, email: `asistente.${suffix}@example.com` };

  const api = await playwright.request.newContext();
  const { origin } = await registerClinicViaApi(api, clinic);
  await api.dispose();

  await loginAs(page, origin, clinic.email, clinic.password);
  await page.goto(`${origin}/staff`);
  await page.getByRole('button', { name: 'Invitar' }).click();
  const form = page.getByRole('dialog', { name: 'Invitar a la clínica' });
  await form.getByLabel('Nombre completo').fill(invitee.fullName);
  await form.getByLabel('Correo electrónico').fill(invitee.email);
  await form.getByLabel('Rol').selectOption({ label: 'Asistente' });
  await form.getByRole('button', { name: 'Enviar invitación' }).click();
  const created = page.getByRole('dialog', { name: 'Invitación creada' });
  await created.getByRole('button', { name: 'Listo' }).click();
  const oldLink = await invitationLinkFor(invitee.email);

  const row = page
    .getByRole('table', { name: 'Personal de la clínica' })
    .getByRole('row', { name: new RegExp(invitee.fullName) });
  await expect(row).toContainText('Correo: Enviado', { timeout: 15_000 });

  // Reenviar: menú de la fila → confirmación → toast.
  await page.getByRole('button', { name: `Acciones de ${invitee.fullName}` }).click();
  await page.getByRole('menuitem', { name: 'Reenviar invitación' }).click();
  const confirm = page.getByRole('dialog', { name: '¿Reenviar la invitación?' });
  await expect(confirm).toContainText(invitee.email);
  await expect(confirm).toContainText('El enlace anterior dejará de funcionar');
  await confirm.getByRole('button', { name: 'Sí, reenviar' }).click();
  await expect(page.getByText('Invitación reenviada')).toBeVisible({ timeout: 10_000 });
  await expect(confirm).toBeHidden();
  await expect(row).toContainText('Correo: Enviado', { timeout: 15_000 });
  await expect.poll(() => invitationLinkFor(invitee.email)).not.toBe(oldLink);

  // El enlace anterior ya no sirve.
  const other = await browser.newContext({ locale: E2E_BROWSER_LOCALE, timezoneId: 'America/Bogota' });
  try {
    const visitor = await other.newPage();
    await visitor.goto(oldLink);
    await expect(visitor.getByRole('heading', { name: 'Invitación no encontrada' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(visitor.getByLabel('Contraseña', { exact: true })).toHaveCount(0);
  } finally {
    await other.close();
  }
});
