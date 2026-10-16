import { randomUUID } from 'node:crypto';
import { test, expect } from './support/test';
import { loginAs, sessionCookie } from './support/auth';
import { registerClinicViaApi } from './support/api';

/**
 * DX-070 (TST-004): invitar a una persona del equipo y que ACEPTE en otra
 * sesión.
 *
 *   1. El ADMIN, en /staff, invita a una odontóloga y copia el enlace del
 *      diálogo «Invitación creada» (el token solo se ve ahí).
 *   2. En OTRO contexto del navegador (otra persona, sin la cookie del ADMIN)
 *      se abre `/invitacion/[token]`: clínica, rol y correo enmascarado, se
 *      crea la contraseña y entra directo a la app con su propia sesión.
 *   3. El ADMIN la ve como «Aceptado»; el enlace ya no sirve («ya utilizada»);
 *      y la invitada puede volver a entrar con la contraseña que eligió.
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
  const link = (await created.getByText(/\/invitacion\//).textContent())?.trim() ?? '';
  expect(link).toMatch(new RegExp(`^${origin}/invitacion/[^/\\s]+$`));
  await created.getByRole('button', { name: 'Listo' }).click();
  await expect(page.getByRole('table', { name: 'Personal de la clínica' })).toContainText(
    invitee.email,
  );

  // --- 2. Otra sesión (otro contexto, sin cookies del ADMIN) acepta ---
  const inviteeContext = await browser.newContext({
    locale: 'es-CO',
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
  await expect(row).toContainText('Aceptado', { timeout: 15_000 });
  await expect(row).toContainText('Odontólogo/a');
});
